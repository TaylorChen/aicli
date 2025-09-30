import { EventEmitter } from 'events';
import { AIProvider, ChatMessage } from '../types';
import { config } from '../config';
import { StreamingResponse } from '../types';
import axios from 'axios';

export class StreamingAIService extends EventEmitter {
  private provider: AIProvider;
  private apiKey: string;

  constructor(provider: AIProvider, apiKey: string) {
    super();
    this.provider = provider;
    this.apiKey = apiKey;
  }

  async sendStreamingMessage(messages: ChatMessage[], model?: string): Promise<void> {
    const selectedModel = model || this.provider.defaultModel;

    switch (this.provider.name) {
      case 'claude':
        await this.sendClaudeStreamingMessage(messages, selectedModel);
        break;
      case 'deepseek':
      case 'kimi':
      case 'openai':
        await this.sendOpenAIStreamingMessage(messages, selectedModel);
        break;
      default:
        // Fallback to non-streaming for unsupported providers
        await this.sendNonStreamingMessage(messages, selectedModel);
    }
  }

  private async sendClaudeStreamingMessage(messages: ChatMessage[], model: string): Promise<void> {
    try {
      const response = await axios.post(
        `${this.provider.baseUrl}/v1/messages`,
        {
          model: model,
          max_tokens: 4096,
          stream: true,
          messages: messages.map(msg => ({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
          }))
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          },
          responseType: 'stream'
        }
      );

      let content = '';
      let tokens = 0;

      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'content_block_delta') {
                content += data.delta.text;
                this.emit('chunk', { content: data.delta.text, done: false });
              } else if (data.type === 'message_stop') {
                this.emit('chunk', { content: '', done: true, tokens });
              }
            } catch (error) {
              // Ignore parsing errors for incomplete chunks
            }
          }
        }
      });

      response.data.on('end', () => {
        this.emit('chunk', { content: '', done: true, tokens });
      });

    } catch (error) {
      this.emit('error', error instanceof Error ? error.message : 'Claude API Error');
    }
  }

  private async sendOpenAIStreamingMessage(messages: ChatMessage[], model: string): Promise<void> {
    try {
      const response = await axios.post(
        `${this.provider.baseUrl}/v1/chat/completions`,
        {
          model: model,
          messages: messages,
          max_tokens: 4096,
          temperature: 0.7,
          stream: true
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          responseType: 'stream'
        }
      );

      let content = '';
      let tokens = 0;

      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              this.emit('chunk', { content: '', done: true, tokens });
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices[0]?.delta;
              if (delta?.content) {
                content += delta.content;
                this.emit('chunk', { content: delta.content, done: false });
              }
            } catch (error) {
              // Ignore parsing errors
            }
          }
        }
      });

    } catch (error) {
      this.emit('error', error instanceof Error ? error.message : `${this.provider.name} API Error`);
    }
  }

  private async sendNonStreamingMessage(messages: ChatMessage[], model: string): Promise<void> {
    try {
      const response = await axios.post(
        `${this.provider.baseUrl}/v1/chat/completions`,
        {
          model: model,
          messages: messages,
          max_tokens: 4096,
          temperature: 0.7
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      const content = response.data.choices[0].message.content;
      const tokens = response.data.usage?.total_tokens;

      this.emit('chunk', { content, done: true, tokens });

    } catch (error) {
      this.emit('error', error instanceof Error ? error.message : 'API Error');
    }
  }
}

export const createStreamingAIService = () => {
  const provider = config.getCurrentProvider();
  if (!provider) {
    throw new Error('No provider configured');
  }

  const apiKey = config.getApiKey(provider.name);
  if (!apiKey) {
    throw new Error(`API key not found for provider ${provider.name}`);
  }

  return new StreamingAIService(provider, apiKey);
};
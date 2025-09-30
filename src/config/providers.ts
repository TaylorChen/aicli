import { AIProvider } from '../types';

export const AI_PROVIDERS: AIProvider[] = [
  {
    name: 'claude',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-3-sonnet-20240229', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
    defaultModel: 'claude-3-sonnet-20240229',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY'
  },
  {
    name: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-coder', 'deepseek-chat'],
    defaultModel: 'deepseek-coder',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY'
  },
  {
    name: 'kimi',
    baseUrl: 'https://api.moonshot.cn',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    defaultModel: 'moonshot-v1-8k',
    apiKeyEnvVar: 'MOONSHOT_API_KEY'
  },
  {
    name: 'openai',
    baseUrl: 'https://api.openai.com',
    models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4',
    apiKeyEnvVar: 'OPENAI_API_KEY'
  },
  {
    name: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    models: ['gemini-pro', 'gemini-pro-vision'],
    defaultModel: 'gemini-pro',
    apiKeyEnvVar: 'GOOGLE_API_KEY'
  },
  {
    name: 'grok',
    baseUrl: 'https://api.x.ai',
    models: ['grok-beta'],
    defaultModel: 'grok-beta',
    apiKeyEnvVar: 'GROK_API_KEY'
  }
];

export const getProviderByName = (name: string): AIProvider | undefined => {
  return AI_PROVIDERS.find(provider => provider.name === name);
};

export const getAllProviderNames = (): string[] => {
  return AI_PROVIDERS.map(provider => provider.name);
};

export const validateProviderConfig = (providerName: string, apiKey: string): boolean => {
  const provider = getProviderByName(providerName);
  if (!provider) return false;

  return apiKey.length > 0;
};
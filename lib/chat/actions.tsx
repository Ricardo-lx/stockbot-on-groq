import 'server-only'

import { generateText } from 'ai';
import {
  createAI,
  createStreamableUI,
  getMutableAIState,
  getAIState,
  streamUI,
  createStreamableValue
} from 'ai/rsc'
import { createOpenAI } from '@ai-sdk/openai'

import {
  spinner,
  BotCard,
  BotMessage,
  SystemMessage,
  Stock,
  Purchase
} from '@/components/stocks'

import { z } from 'zod'
import { EventsSkeleton } from '@/components/stocks/events-skeleton'
import { Events } from '@/components/stocks/events'
import { StocksSkeleton } from '@/components/stocks/stocks-skeleton'
import { Stocks } from '@/components/stocks/stocks'
import { StockSkeleton } from '@/components/stocks/stock-skeleton'
import {
  formatNumber,
  runAsyncFnWithoutBlocking,
  sleep,
  nanoid
} from '@/lib/utils'
import { SpinnerMessage, UserMessage } from '@/components/stocks/message'
import { Chat, Message } from '@/lib/types'
import { StockChart } from '@/components/tradingview/stock-chart'
import { StockPrice } from '@/components/tradingview/stock-price'
import { StockNews } from '@/components/tradingview/stock-news'
import { StockFinancials } from '@/components/tradingview/stock-financials'
import { StockScreener } from '@/components/tradingview/stock-screener'
import { MarketOverview } from '@/components/tradingview/market-overview'
import { MarketHeatmap } from '@/components/tradingview/market-heatmap'

export type AIState = {
  chatId: string
  messages: Message[]
}

export type UIState = {
  id: string
  display: React.ReactNode
}[]

interface MutableAIState {
  update: (newState:any) => void;
  done: (newState: any) => void;
  get: () => AIState;
}

const MODEL = 'llama3-70b-8192';
const TOOL_MODEL = 'llama3-70b-8192';

    // llama3-groq-70b-8192-tool-use-preview


async function generateCaption(symbol: string, toolName: string, aiState: MutableAIState, groqApiKey: string): Promise<string> {
  const groq = createOpenAI({
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey: groqApiKey,
  });

  aiState.update({
    ...aiState.get(),
    messages: [
      ...aiState.get().messages
    ]
  })
  const captionSystemMessage = `\
    You are a stock market conversation bot. You can provide the user information about stocks include prices and charts in the UI. You do not have access to any information and should only provide information by calling functions.
    
    These are the tools you have available:
    1. showStockFinancials
    This tool shows the financials for a given stock.

    2. showStockChart
    This tool shows a stock chart for a given stock or currency.

    3. showStockPrice
    This tool shows the price of a stock or currency.
    
    4. showStockNews
    This tool shows the latest news and events for a stock or cryptocurrency.

    5. showStockScreener
    This tool shows a generic stock screener which can be used to find new stocks based on financial or technical parameters.

    6. showMarketOverview
    This tool shows an overview of today's stock, futures, bond, and forex market performance including change values, Open, High, Low, and Close values.

    7. showMarketHeatmap
    This tool shows a heatmap of today's stock market performance across sectors.

    You have just called a tool (`+toolName+` for `+symbol+`) to respond to the user. Now generate text to go alongside that tool response, which may be a graphic like a chart or price history.
      
    Example:

    User: What is the price of AAPL?
    Assistant: { "tool_call": { "id": "pending", "type": "function", "function": { "name": "showStockPrice" }, "parameters": { "symbol": "AAPL" } } } 
    
    Assistant (you): The price of AAPL stock is provided above. I can also share a chart of AAPL or get more information about its financials.

    or

    Assistant (you): This is the price of AAPL stock. I can also generate a chart or share further financial data.

    or 
    Assistant (you): Would you like to see a chart of AAPL or get more information about its financials?

    ## Guidelines
    Talk like one of the above responses, but BE CREATIVE and generate a DIVERSE response. 
    
    Your response should be BRIEF, about 2-3 sentences.

    Besides the symbol, you cannot customize any of the screeners or graphics. Do not tell the user that you can.
    `
  // Assistant (you): Here is the price of AAPL stock. Would you like to see a chart of AAPL or get more information about its financials?

  const response = await generateText({
    model: groq(MODEL),
    messages: [
      {
        role: 'system',
        content: captionSystemMessage
      },
      ...aiState.get().messages.map((message: any) => ({
        role: message.role,
        content: message.content,
        name: message.name
      }))
    ]
  });

  return response.text || '';
}

async function submitUserMessage(content: string, groqApiKey: string) {
  'use server'

  const aiState = getMutableAIState<typeof AI>()

  aiState.update({
    ...aiState.get(),
    messages: [
      ...aiState.get().messages,
      {
        id: nanoid(),
        role: 'user',
        content
      }
    ]
  })

  let textStream: undefined | ReturnType<typeof createStreamableValue<string>>
  let textNode: undefined | React.ReactNode

  const groq = createOpenAI({
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey: groqApiKey,
  });
  
  const result = await streamUI({
    model: groq(TOOL_MODEL),
    initial: <SpinnerMessage />,
    system: `\
    You are a stock market conversation bot. You can provide the user information about stocks include prices and charts in the UI. You do not have access to any information and should only provide information by calling functions.
    
    ### Example function calling:
    1. showStockFinancials
    This tool shows the financials for a given stock.
    Parameters:
    symbol: The name or symbol of the stock or currency (string).
    Prompt Example:
      {
      "toolName": "showStockChart",
      "args": {
        "symbol": "AAPL",
      }
      }
    2. showStockChart
    This tool shows a stock chart for a given stock or currency.
    Parameters:
    symbol: The name or symbol of the stock or currency (string).
    Prompt Example:
      {
      "toolName": "showStockChart",
      "args": {
        "symbol": "AAPL",
      }
      }
    3. showStockPrice
    This tool shows the price of a stock or currency.
    Parameters:
    symbol: The name or symbol of the stock or currency (string).
    Prompt Example:
      {
      "toolName": "showStockPrice",
      "args": {
        "symbol": "TSLA",
      }
    }
    4. showStockNews
    This tool shows the latest news and events for a stock or cryptocurrency.
    Parameters:
    symbol: The name or symbol of the stock or currency (string).
    Prompt Example:
      {
      "toolName": "showStockNews",
      "args": {
        "symbol": "TSLA",
      }
    }
    5. showStockScreener
    This tool shows a stock screener which the user can use to filter stocks based upon financials and technicals.
    Parameters:
    *none*
    Prompt Example:
      {
      "toolName": "showStockScreener",
      "args": {}
    }
    6. showMarketOverview
    This tool shows an overview of today's stock, futures, bond, and forex market performance including change values, Open, High, Low, and Close values.
    Parameters:
    *none*
    Prompt Example:
      {
      "toolName": "showMarketOverview",
      "args": {}
    }
    7. showMarketHeatmap
    This tool shows a heatmap of today's stock market performance across sectors. It is preferred over showMarketOverview if asked specifically about the stock market.
    Parameters:
    *none*
    Prompt Example:
      {
      "toolName": "showMarketHeatmap",
      "args": {}
    }
    
    ### Date formatting:
    For any dates, use the format YYYY-MM-DD.
    
    Example: 2022-01-01

    ### Cryptocurrency Tickers
    For any cryptocurrency, append "USD" at the end of the ticker when using functions. For instance, "DOGE" should be "DOGEUSD".

    ### Guidelines:

    Never provide empty results to the user. Provide the relevant tool if it matches the user's request. Otherwise, respond as the stock bot.
    Example:

    User: What is the price of AAPL?
    Assistant (you): { "tool_call": { "id": "pending", "type": "function", "function": { "name": "showStockPrice" }, "parameters": { "symbol": "AAPL" } } } 
    `,
    messages: [
      ...aiState.get().messages.map((message: any) => ({
        role: message.role,
        content: message.content,
        name: message.name
      }))
    ],
    text: ({ content, done, delta }) => {    
      if (!textStream) {        
        textStream = createStreamableValue('')
        textNode = <BotMessage content={textStream.value} />
      }

      if (done) {
        textStream.done()
        aiState.done({
          ...aiState.get(),
          messages: [
            ...aiState.get().messages,
            {
              id: nanoid(),
              role: 'assistant',
              content
            }
          ]
        })
      } else {
        textStream.update(delta)
      }

      return textNode
    },
    tools: {
      showStockChart: {
        description:
          'Show a stock chart of a given stock. Use this to show the chart to the user.',
        parameters: z.object({
          symbol: z
            .string()
            .describe(
              'The name or symbol of the stock or currency. e.g. DOGE/AAPL/USD.'
            )
        }),
        generate: async function* ({ symbol }) {
          yield (
            <BotCard>
              <StockSkeleton />
            </BotCard>
          )

          const toolCallId = nanoid()

          aiState.done({
            ...aiState.get(),
            messages: [
              ...aiState.get().messages,
              {
                id: nanoid(),
                role: 'assistant',
                content: [
                  {
                    type: 'tool-call',
                    toolName: 'showStockChart',
                    toolCallId,
                    args: { symbol }
                  }
                ]
              },
              {
                id: nanoid(),
                role: 'tool',
                content: [
                  {
                    type: 'tool-result',
                    toolName: 'showStockChart',
                    toolCallId,
                    result: { symbol }
                  }
                ]
              }
            ]
          })

          const caption = await generateCaption(symbol,"showStockChart",aiState,groqApiKey=groqApiKey);

          return (
            <BotCard>
              <StockChart props={symbol} />
              {caption}
            </BotCard>
          )
        }
      },
      showStockPrice: {
        description:
          'Show the price of a given stock. Use this to show the price and price history to the user.',
        parameters: z.object({
          symbol: z
            .string()
            .describe(
              'The name or symbol of the stock or currency. e.g. DOGE/AAPL/USD.'
            )
        }),
        generate: async function* ({ symbol }) {
          yield (
            <BotCard>
              <StockSkeleton />
            </BotCard>
          )

          const toolCallId = nanoid()

          aiState.done({
            ...aiState.get(),
            messages: [
              ...aiState.get().messages,
              {
                id: nanoid(),
                role: 'assistant',
                content: [
                  {
                    type: 'tool-call',
                    toolName: 'showStockPrice',
                    toolCallId,
                    args: { symbol }
                  }
                ]
              },
              {
                id: nanoid(),
                role: 'tool',
                content: [
                  {
                    type: 'tool-result',
                    toolName: 'showStockPrice',
                    toolCallId,
                    result: { symbol }
                  }
                ]
              }
            ]
          })
          const caption = await generateCaption(symbol,"showStockPrice",aiState,groqApiKey=groqApiKey);

          return (
            <BotCard>
              <StockPrice props={symbol} />
              {caption}
            </BotCard>
          )
        }
      },
      showStockFinancials: {
        description:
          'Show the financials of a given stock. Use this to show the financials to the user.',
        parameters: z.object({
          symbol: z
            .string()
            .describe(
              'The name or symbol of the stock or currency. e.g. DOGE/AAPL/USD.'
            )
        }),
        generate: async function* ({ symbol }) {
          yield (
            <BotCard>
              <StockSkeleton />
            </BotCard>
          )

          const toolCallId = nanoid()

          aiState.done({
            ...aiState.get(),
            messages: [
              ...aiState.get().messages,
              {
                id: nanoid(),
                role: 'assistant',
                content: [
                  {
                    type: 'tool-call',
                    toolName: 'showStockFinancials',
                    toolCallId,
                    args: { symbol }
                  }
                ]
              },
              {
                id: nanoid(),
                role: 'tool',
                content: [
                  {
                    type: 'tool-result',
                    toolName: 'showStockFinancials',
                    toolCallId,
                    result: { symbol }
                  }
                ]
              }
            ]
          })

          const caption = await generateCaption(symbol,"StockFinancials",aiState,groqApiKey=groqApiKey);

          return (
            <BotCard>
              <StockFinancials props={symbol} />
              {caption}
            </BotCard>
          )

        }
      },
      showStockNews: {
        description:
          'This tool shows the latest news and events for a stock or cryptocurrency.',
        parameters: z.object({
          symbol: z
            .string()
            .describe(
              'The name or symbol of the stock or currency. e.g. DOGE/AAPL/USD.'
            )
        }),
        generate: async function* ({ symbol }) {
          yield (
            <BotCard>
              <StockSkeleton />
            </BotCard>
          )

          const toolCallId = nanoid()

          aiState.done({
            ...aiState.get(),
            messages: [
              ...aiState.get().messages,
              {
                id: nanoid(),
                role: 'assistant',
                content: [
                  {
                    type: 'tool-call',
                    toolName: 'showStockNews',
                    toolCallId,
                    args: { symbol }
                  }
                ]
              },
              {
                id: nanoid(),
                role: 'tool',
                content: [
                  {
                    type: 'tool-result',
                    toolName: 'showStockNews',
                    toolCallId,
                    result: { symbol }
                  }
                ]
              }
            ]
          })

          const caption = await generateCaption(symbol,"showStockNews",aiState,groqApiKey=groqApiKey);

          return (
            <BotCard>
              <StockNews props={symbol} />
              {caption}
            </BotCard>
          )

        }
      },
      showStockScreener: {
        description:
          'This tool shows a generic stock screener which can be used to find new stocks based on financial or technical parameters.',
        parameters: z.object({
        }),
        generate: async function* ({ }) {
          yield (
            <BotCard>
              <StockSkeleton />
            </BotCard>
          )

          const toolCallId = nanoid()

          aiState.done({
            ...aiState.get(),
            messages: [
              ...aiState.get().messages,
              {
                id: nanoid(),
                role: 'assistant',
                content: [
                  {
                    type: 'tool-call',
                    toolName: 'showStockScreener',
                    toolCallId,
                    args: { }
                  }
                ]
              },
              {
                id: nanoid(),
                role: 'tool',
                content: [
                  {
                    type: 'tool-result',
                    toolName: 'showStockScreener',
                    toolCallId,
                    result: { }
                  }
                ]
              }
            ]
          })
          const caption = await generateCaption("Generic","showStockScreener",aiState,groqApiKey=groqApiKey);

          return (
            <BotCard>
              <StockScreener />
              {caption}
            </BotCard>
          )
        }
      },
      showMarketOverview: {
        description:
          `This tool shows an overview of today's stock, futures, bond, and forex market performance including change values, Open, High, Low, and Close values.`,
        parameters: z.object({
        }),
        generate: async function* ({ }) {
          yield (
            <BotCard>
              <StockSkeleton />
            </BotCard>
          )

          const toolCallId = nanoid()

          aiState.done({
            ...aiState.get(),
            messages: [
              ...aiState.get().messages,
              {
                id: nanoid(),
                role: 'assistant',
                content: [
                  {
                    type: 'tool-call',
                    toolName: 'showMarketOverview',
                    toolCallId,
                    args: { }
                  }
                ]
              },
              {
                id: nanoid(),
                role: 'tool',
                content: [
                  {
                    type: 'tool-result',
                    toolName: 'showMarketOverview',
                    toolCallId,
                    result: { }
                  }
                ]
              }
            ]
          })
          const caption = await generateCaption("Generic","showMarketOverview",aiState,groqApiKey=groqApiKey);

          return (
            <BotCard>
              <MarketOverview />
              {caption}
            </BotCard>
          )
        }
      },
      showMarketHeatmap: {
        description:
          `This tool shows a heatmap of today's stock market performance across sectors. It is preferred over showMarketOverview if asked specifically about the stock market.`,
        parameters: z.object({
        }),
        generate: async function* ({ }) {
          yield (
            <BotCard>
              <StockSkeleton />
            </BotCard>
          )

          const toolCallId = nanoid()

          aiState.done({
            ...aiState.get(),
            messages: [
              ...aiState.get().messages,
              {
                id: nanoid(),
                role: 'assistant',
                content: [
                  {
                    type: 'tool-call',
                    toolName: 'showMarketHeatmap',
                    toolCallId,
                    args: { }
                  }
                ]
              },
              {
                id: nanoid(),
                role: 'tool',
                content: [
                  {
                    type: 'tool-result',
                    toolName: 'showMarketHeatmap',
                    toolCallId,
                    result: { }
                  }
                ]
              }
            ]
          })
          const caption = await generateCaption("Generic","showMarketHeatmap",aiState,groqApiKey=groqApiKey);

          return (
            <BotCard>
              <MarketHeatmap />
              {caption}
            </BotCard>
          )
        }
      },
    }
  })

  return {
    id: nanoid(),
    display: result.value
  }
}


export const AI = createAI<AIState, UIState>({
  actions: {
    submitUserMessage,
  },
  initialUIState: [],
  initialAIState: { chatId: nanoid(), messages: [] },
})

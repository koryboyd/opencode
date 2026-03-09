import { Identifier } from "@/id/id"
import { Session } from "."
import { Provider } from "@/provider/provider"
import { MessageV2 } from "./message-v2"
import { LLM } from "./llm"
import { Log } from "@/util/log"
import { Instance } from "@/project/instance"

const log = Log.create({ service: "collaborative" })

const ITERATIONS = 3

export interface CollaborativeResult {
  responses: Map<number, string>
  messages: MessageV2.Assistant[]
}

export async function executeCollaborative(params: {
  sessionID: string
  agentName: string
  userMessage: MessageV2.User
  messages: any[]
  models: { providerID: string; modelID: string }[]
  abort: AbortSignal
  tools: Record<string, any>
}): Promise<CollaborativeResult | null> {
  const { sessionID, agentName, userMessage, messages, models, abort, tools } = params

  if (!models || models.length < 2) {
    return null
  }

  log.info("Executing collaborative workflow", {
    sessionID,
    agentName,
    modelCount: models.length,
    iterations: ITERATIONS,
  })

  const resolvedModels = await Promise.all(
    models.map(async (m) => {
      return await Provider.getModel(m.providerID, m.modelID)
    }),
  )

  const responses = new Map<number, string>()
  const assistantMessages: MessageV2.Assistant[] = []

  let contextPrompt = ""

  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    const modelIndex = iteration % resolvedModels.length
    const model = resolvedModels[modelIndex]

    log.info("Collaborative iteration", {
      iteration,
      modelIndex,
      modelId: model.id,
    })

    const assistantMessage: MessageV2.Assistant = {
      id: Identifier.ascending("message"),
      parentID: userMessage.id,
      role: "assistant",
      sessionID,
      mode: agentName,
      agent: `collab-${model.id}`,
      variant: userMessage.variant,
      path: {
        cwd: Instance.directory,
        root: Instance.worktree,
      },
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      modelID: model.id,
      providerID: model.providerID,
      time: {
        created: Date.now(),
      },
    }

    await Session.updateMessage(assistantMessage)
    assistantMessages.push(assistantMessage)

    try {
      const streamResult = await LLM.stream({
        agent: { name: agentName } as any,
        user: userMessage,
        system: [],
        tools,
        model,
        abort,
        sessionID,
        messages: [
          ...messages.map((m: any) => ({
            role: m.info.role,
            content: m.parts?.map((p: any) => (p.type === "text" ? p.text : "")).join("") || "",
          })),
          {
            role: "user" as const,
            content:
              iteration > 0
                ? `Refine and improve your response based on this feedback from other models:\n\n${contextPrompt}\n\nOriginal request: Please provide your best response considering the above feedback.`
                : "Please provide your best response.",
          },
        ],
        retries: 0,
      })

      let fullResponse = ""
      for await (const chunk of streamResult.fullStream) {
        if (chunk.type === "text-delta") {
          fullResponse += (chunk as any).text
        }
      }

      responses.set(iteration, fullResponse)
      contextPrompt += `\n[Model ${modelIndex + 1} (${model.id})]: ${fullResponse}`

      assistantMessage.finish = "stop"
      assistantMessage.time.completed = Date.now()
      await Session.updateMessage(assistantMessage)

      log.info("Collaborative iteration complete", {
        iteration,
        modelId: model.id,
        responseLength: fullResponse.length,
      })
    } catch (error) {
      log.error("Collaborative iteration failed", {
        iteration,
        modelId: model.id,
        error,
      })
      assistantMessage.finish = "error"
      assistantMessage.time.completed = Date.now()
      await Session.updateMessage(assistantMessage)
    }
  }

  return {
    responses,
    messages: assistantMessages,
  }
}

export function mergeCollaborativeResponses(responses: Map<number, string>, _models: Provider.Model[]): string {
  const parts: string[] = []

  responses.forEach((response, iteration) => {
    if (response) {
      parts.push(`## Model ${(iteration % 2) + 1} (Iteration ${iteration + 1}):\n\n${response}`)
    }
  })

  return parts.join("\n\n---\n\n")
}

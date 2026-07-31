import { z } from "zod"

const ConfigSchema = z.object({
  /** Slack bot token (xoxb-...) */
  slackBotToken: z.string().startsWith("xoxb-"),
  /** Slack app-level token for socket mode (xapp-...) */
  slackAppToken: z.string().startsWith("xapp-"),
  /** Slack signing secret */
  slackSigningSecret: z.string().min(1),
  /** Root directory of the THRUNT workspace to monitor */
  workspaceRoot: z.string().min(1),
  /** Channel ID for publishing hunt summaries (optional — can be overridden per case) */
  defaultChannelId: z.string().optional(),
  /** Port for HTTP mode (socket mode is default) */
  port: z.number().int().positive().default(3100),
  /** Log level */
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
})

export type Config = z.infer<typeof ConfigSchema>

export function loadConfig(): Config {
  return ConfigSchema.parse({
    slackBotToken: process.env.SLACK_BOT_TOKEN,
    slackAppToken: process.env.SLACK_APP_TOKEN,
    slackSigningSecret: process.env.SLACK_SIGNING_SECRET,
    workspaceRoot: process.env.THRUNT_WORKSPACE_ROOT ?? process.cwd(),
    defaultChannelId: process.env.SLACK_DEFAULT_CHANNEL,
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3100,
    logLevel: (process.env.LOG_LEVEL as Config["logLevel"]) ?? "info",
  })
}

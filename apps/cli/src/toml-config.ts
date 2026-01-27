import fs from "fs";
import path from "path";
import TOML from "@iarna/toml";
import Joi from "joi";

export type TunnelProtocol = "http" | "tcp" | "udp";

export interface TunnelConfig {
  protocol: TunnelProtocol;
  local_port: number;
  local_host?: string;
  subdomain?: string;
  custom_domain?: string;
  remote_port?: number;
  org?: string;
}

export interface GlobalConfig {
  org?: string;
  server_url?: string;
}

export interface OutRayTomlConfig {
  global?: GlobalConfig;
  tunnel?: Record<string, TunnelConfig>;
}

export interface ParsedTunnelConfig {
  name: string;
  protocol: TunnelProtocol;
  localPort: number;
  localHost: string;
  subdomain?: string;
  customDomain?: string;
  remotePort?: number;
  org?: string;
}

const portSchema = Joi.number().integer().min(1).max(65535).required();

const globalConfigSchema = Joi.object({
  org: Joi.string().optional(),
  server_url: Joi.string().uri({ scheme: ['ws', 'wss'] }).optional().messages({
    'string.uri': 'server_url must be a valid WebSocket URL (ws:// or wss://)',
  }),
});

const tunnelConfigSchema = Joi.object({
  protocol: Joi.string()
    .valid("http", "tcp", "udp")
    .required()
    .messages({
      "any.only": "Protocol must be one of: http, tcp, or udp",
      "any.required": "Protocol is required (must be http, tcp, or udp)",
    }),
  local_port: portSchema.messages({
    "number.base": "Local port must be a number",
    "number.integer": "Local port must be an integer",
    "number.min": "Local port must be between 1 and 65535",
    "number.max": "Local port must be between 1 and 65535",
    "any.required": "Local port is required",
  }),
  local_host: Joi.string().hostname().optional().default("localhost"),
  subdomain: Joi.string().optional(),
  custom_domain: Joi.string().hostname().optional(),
  remote_port: Joi.number().integer().min(1).max(65535).optional(),
  org: Joi.string().optional(),
}).custom((value: TunnelConfig, helpers: Joi.CustomHelpers) => {
  const protocol = value.protocol;

  if (protocol === "http") {
    if (value.remote_port !== undefined) {
      return helpers.error("any.invalid", {
        message: `remote_port is not valid for HTTP tunnels. HTTP tunnels use URLs, not ports.`,
      });
    }
  }

  if (protocol === "tcp" || protocol === "udp") {
    if (value.subdomain !== undefined) {
      return helpers.error("any.invalid", {
        message: `subdomain is not valid for ${protocol.toUpperCase()} tunnels. ${protocol.toUpperCase()} tunnels use ports, not subdomains.`,
      });
    }
    if (value.custom_domain !== undefined) {
      return helpers.error("any.invalid", {
        message: `custom_domain is not valid for ${protocol.toUpperCase()} tunnels. ${protocol.toUpperCase()} tunnels use ports, not domains.`,
      });
    }
  }

  return value;
});

const configSchema = Joi.object({
  global: globalConfigSchema.optional(),
  tunnel: Joi.object()
    .pattern(Joi.string(), tunnelConfigSchema)
    .min(1)
    .required()
    .messages({
      "object.min": "No tunnels defined in config file",
    }),
});

export class TomlConfigParser {
  static loadTomlConfig(configPath: string): {
    tunnels: ParsedTunnelConfig[];
    global?: GlobalConfig;
  } {
    const fullPath = path.resolve(configPath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Config file not found: ${fullPath}`);
    }

    const fileContent = fs.readFileSync(fullPath, "utf-8");
    let rawConfig: any;

    try {
      rawConfig = TOML.parse(fileContent);
    } catch (error) {
      throw new Error(
        `Failed to parse TOML config: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    const { value: config, error: validationError } =
      configSchema.validate(rawConfig, {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: false,
      });

    if (validationError) {
      const errorMessages = validationError.details.map(
        (detail: Joi.ValidationErrorItem) => {
          const pathParts = detail.path;
          const tunnelName = pathParts[1];
          const fieldName = (pathParts[2] as string);

          let message = detail.message;

          if (message.includes("contains an invalid value")) {
            const context = detail.context;
            if (context?.message) {
              message = context.message;
            } else {
              message = message.replace("contains an invalid value", "has invalid configuration");
            }
          }

            if (fieldName) {
              const fieldDisplayName = fieldName.replace(/_/g, " ");
              const fullPath = detail.path.join(".");
              
              if (message.includes(`"${fullPath}"`)) {
                message = message.replace(`"${fullPath}"`, fieldDisplayName);
              } else if (message.includes(fieldName)) {
                message = message.replace(new RegExp(fieldName, "g"), fieldDisplayName);
              }
            }

            message = message.replace(/^"/, "").replace(/"$/, "");

          if (tunnelName && typeof tunnelName === "string") {
            const capitalizedMessage = message.charAt(0).toUpperCase() + message.slice(1);
            return `Tunnel "${tunnelName}": ${capitalizedMessage}`;
          }

          if (pathParts.length > 0) {
            return `${pathParts.join(".")}: ${detail.message}`;
          }

          return detail.message;
        },
      );

      throw new Error(errorMessages.join("\n"));
    }

    const tunnels: ParsedTunnelConfig[] = [];
    const globalConfig = config.global;

    for (const [name, tunnelConfig] of Object.entries(config.tunnel)) {
      const tunnel = tunnelConfig as TunnelConfig;
      tunnels.push({
        name,
        protocol: tunnel.protocol,
        localPort: tunnel.local_port,
        localHost: tunnel.local_host || "localhost",
        subdomain: tunnel.subdomain,
        customDomain: tunnel.custom_domain,
        remotePort: tunnel.remote_port,
        org: tunnel.org || globalConfig?.org,
      });
    }

    return { tunnels, global: globalConfig };
  }
}

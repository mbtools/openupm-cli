import chalk from "chalk";
import { Logger } from "npmlog";
import path from "path";
import { CustomError } from "ts-custom-error";
import { CmdOptions } from "../cli/options";
import { Registry } from "../domain/registry";
import { coerceRegistryUrl, RegistryUrl } from "../domain/registry-url";
import { tryGetAuthForRegistry, UpmConfig } from "../domain/upm-config";
import { GetCwd } from "../io/special-paths";
import { GetUpmConfigPath } from "../io/upm-config-io";
import { DebugLog } from "../logging";
import { tryGetEnv } from "../utils/env-util";
import { assertIsError } from "../utils/error-type-guards";
import { GetRegistryAuth } from "./get-registry-auth";

/**
 * Error for when auth information for a registry could not be loaded.
 */
export class RegistryAuthLoadError extends CustomError {
  // noinspection JSUnusedLocalSymbols
}

/**
 * Contains information about the environment and context a command is run in.
 */
export type Env = Readonly<{
  /**
   * The working directory.
   */
  cwd: string;
  /**
   * Whether the user is a system-user.
   */
  systemUser: boolean;
  /**
   * Whether to fall back to the upstream registry.
   */
  upstream: boolean;
  /**
   * The upstream registry.
   */
  upstreamRegistry: Registry;
  /**
   * The primary registry.
   */
  registry: Registry;
}>;

/**
 * Function for parsing environment information and global
 * command-options for further usage.
 * @param options The options passed to the current command.
 * @returns Environment information.
 */
export type ParseEnv = (options: CmdOptions) => Promise<Env>;

/**
 * Creates a {@link ParseEnv} function.
 */
export function makeParseEnv(
  log: Logger,
  getUpmConfigPath: GetUpmConfigPath,
  getRegistryAuth: GetRegistryAuth,
  getCwd: GetCwd,
  debugLog: DebugLog
): ParseEnv {
  function determineCwd(options: CmdOptions): string {
    return options.chdir !== undefined ? path.resolve(options.chdir) : getCwd();
  }

  function determinePrimaryRegistry(
    options: CmdOptions,
    upmConfig: UpmConfig
  ): Registry {
    const url =
      options.registry !== undefined
        ? coerceRegistryUrl(options.registry)
        : RegistryUrl.parse("https://package.openupm.com");

    const auth = tryGetAuthForRegistry(upmConfig, url);

    if (auth === null) {
      log.warn(
        "env.auth",
        `failed to parse auth info for ${url} in .upmconfig.toml: missing token or _auth fields`
      );
    }

    return { url, auth };
  }

  function determineUpstreamRegistry(): Registry {
    const url = RegistryUrl.parse("https://packages.unity.com");

    return { url, auth: null };
  }

  function determineLogLevel(options: CmdOptions): "verbose" | "notice" {
    return options.verbose ? "verbose" : "notice";
  }

  function determineUseColor(options: CmdOptions): boolean {
    return options.color !== false && tryGetEnv("NODE_ENV") !== "test";
  }

  function determineUseUpstream(options: CmdOptions): boolean {
    return options.upstream !== false;
  }

  function determineIsSystemUser(options: CmdOptions): boolean {
    return options.systemUser === true;
  }

  return async (options) => {
    // log level
    log.level = determineLogLevel(options);

    // color
    const useColor = determineUseColor(options);
    if (!useColor) {
      chalk.level = 0;
      log.disableColor();
    }

    // upstream
    const upstream = determineUseUpstream(options);

    // auth
    const systemUser = determineIsSystemUser(options);

    // registries
    const upmConfigPath = await getUpmConfigPath(systemUser);

    let registry: Registry;
    let upstreamRegistry: Registry;
    try {
      const upmConfig = await getRegistryAuth(upmConfigPath);
      registry = determinePrimaryRegistry(options, upmConfig);
      upstreamRegistry = determineUpstreamRegistry();
    } catch (error) {
      assertIsError(error);
      debugLog("Upmconfig load or parsing failed.", error);
      throw new RegistryAuthLoadError();
    }

    // cwd
    const cwd = determineCwd(options);

    return {
      cwd,
      registry,
      systemUser,
      upstream,
      upstreamRegistry,
    };
  };
}

import { createDockerDesktopClient, } from "@docker/extension-api-client";

export const ddClient = createDockerDesktopClient();

export function useDockerDesktopClient() {
    return ddClient;
}
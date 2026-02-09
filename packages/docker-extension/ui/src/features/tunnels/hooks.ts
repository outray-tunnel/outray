import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDockerDesktopClient } from "../../hooks/use-docker-desktop-client";
import { getErrorMessage } from "../../lib/utils";

export type Tunnel = {
    containerId: string;
    port: number;
    url: string | null;
    status: 'online' | 'offline' | 'starting';
    subdomain?: string;
}

export function useTunnels() {
    const ddClient = useDockerDesktopClient();

    return useQuery({
        queryKey: ['tunnels'],
        queryFn: async () => {
            const response = await ddClient.extension.vm?.service?.get('/tunnels') as { success: boolean, data?: Tunnel[] };

            return response.data
        },
        refetchInterval: 5000,
    });
}

export function useCreateTunnel() {
    const ddClient = useDockerDesktopClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (vars: { containerId: string, port: number, subdomain?: string }) => {
            try {
                const res = await ddClient.extension.vm?.service?.post('/tunnels', {
                    containerId: vars.containerId,
                    port: vars.port,
                    subdomain: vars.subdomain,
                }) as { success: boolean, error?: string, data?: { containerId: string } };

                if (!res.success) {
                    throw new Error(res.error || 'Failed to start tunnel');
                }
                return res.data;
            } catch (error) {
                const errorMsg = getErrorMessage(error)
                throw new Error(errorMsg)
            }
        },
        onSuccess: async (data, variables) => {
            await queryClient.invalidateQueries({ queryKey: ['tunnels'] });

        }
    });
}

export function useStopTunnel() {
    const ddClient = useDockerDesktopClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (containerId: string) => {
            const res = await ddClient.extension.vm?.service?.put(`/tunnels/${containerId}/stop`, {}) as { success: boolean, error?: string };
            if (!res.success) {
                throw new Error(res.error || 'Failed to stop tunnel');
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tunnels'] });
        }
    });
}

export function useDeleteTunnel() {
    const ddClient = useDockerDesktopClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (containerId: string) => {
            const res = await ddClient.extension.vm?.service?.delete(`/tunnels/${containerId}`) as { success: boolean, error?: string };
            if (!res.success) {
                throw new Error(res.error || 'Failed to delete tunnel');
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tunnels'] });
        }
    });
}

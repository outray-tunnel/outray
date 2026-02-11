import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDockerDesktopClient } from "../../hooks/use-docker-desktop-client";
import { getErrorMessage } from "../../lib/utils";

export function useApiKey() {
    const ddClient = useDockerDesktopClient();

    return useQuery({
        queryKey: ['api-key'],
        queryFn: async () => {
            const response = await ddClient.extension.vm?.service?.get('/api-key') as { success: boolean, data?: { apiKey: string } }

            return response.data ?? null
        }
    });
}

export function useVerifyAndSaveApiKey() {
    const ddClient = useDockerDesktopClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (apiKey: string) => {

            try {
                const res = await ddClient.extension.vm?.service?.post('/api-key', { apiKey }) as { success: boolean, error?: string };

                if (!res.success) {
                    throw new Error(res.error || 'Failed to save key');
                }

                return true;
            } catch (error) {
                const errorMessage = getErrorMessage(error);
                throw new Error(errorMessage);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['api-key'] });
        }
    });
}

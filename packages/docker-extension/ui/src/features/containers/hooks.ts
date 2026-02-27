import { useQuery } from "@tanstack/react-query";
import { useDockerDesktopClient } from "../../hooks/use-docker-desktop-client";

import { Tunnel } from "../../features/tunnels/hooks";

export type Container = {
    tunnel?: Tunnel;
    Id: string;
    Names: string[];
    Image: string;
    ImageID: string;
    ImageManifestDescriptor: {
        mediaType: string;
        digest: string;
        size: number;
        urls: string[];
        annotations: Record<string, string>;
        data: any;
        platform: {
            architecture: string;
            os: string;
            "os.version": string;
            "os.features": string[];
            variant: string;
        };
        artifactType: string | null;
    };
    Command: string;
    Created: string;
    Ports: {
        PrivatePort: number;
        PublicPort: number;
        Type: string;
    }[];
    SizeRw: string;
    SizeRootFs: string;
    Labels: Record<string, string>;
    State: string;
    Status: string;
    HostConfig: {
        NetworkMode: string;
        Annotations: Record<string, string>;
    };
    NetworkSettings: {
        Networks: Record<string, {
            IPAMConfig: {
                IPv4Address: string;
                IPv6Address: string;
                LinkLocalIPs: string[];
            };
            Links: string[];
            MacAddress: string;
            Aliases: string[];
            DriverOpts: Record<string, string>;
            GwPriority: number[];
            NetworkID: string;
            EndpointID: string;
            Gateway: string;
            IPAddress: string;
            IPPrefixLen: number;
            IPv6Gateway: string;
            GlobalIPv6Address: string;
            GlobalIPv6PrefixLen: number;
            DNSNames: string[];
        }>;
    };
    Mounts: {
        Type: string;
        Name: string;
        Source: string;
        Destination: string;
        Driver: string;
        Mode: string;
        RW: boolean;
        Propagation: string;
    }[];
    Health: {
        Status: string;
        FailingStreak: number;
    };
}

export function useRunningContainers() {
    const client = useDockerDesktopClient();

    return useQuery({
        queryKey: ['running-containers'],
        queryFn: async () => {
            const containers = await client.docker.listContainers({
                all: false,
            })



            return (containers as Container[]).filter(c => c.Ports?.some(p => p.PublicPort > 0))
        }
    })
}
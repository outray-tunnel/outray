import { DataGrid } from "@mui/x-data-grid";
import { columns } from "./column";
import { Button, Stack, Typography } from "@mui/material";
import { Refresh, ViewInAr } from "@mui/icons-material";
import { useDockerDesktopClient } from "../../hooks/use-docker-desktop-client";
import { useRunningContainers } from "./hooks";
import { useTunnels } from "../tunnels/hooks";

export function CustomNoRowsOverlay() {
    const client = useDockerDesktopClient();
    return (
        <Stack height="100%" justifyContent="center" alignItems="center" gap={2}>
            <ViewInAr sx={{ fontSize: 64, color: 'text.secondary', opacity: 0.5 }} />
            <Typography variant="h6" color="text.secondary">No containers found</Typography>
            <Typography variant="body2" color="text.secondary">The outray extension can only forward to running containers with published ports</Typography>
            <Button variant="contained" onClick={() => client.desktopUI.navigate.viewContainers()}>
                Start a container
            </Button>
        </Stack>
    );
}

export function ContainersTable() {
    const { data: containers = [], isPending: isContainersPending, refetch } = useRunningContainers();
    const { data: tunnels = [], isPending: isTunnelsPending } = useTunnels();

    const rows = containers.map(c => ({
        ...c,
        tunnel: tunnels.find(t => t.containerId === c.Id)
    }));

    return (
        <>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3} gap={2}>
                <Typography variant="h5">Running Containers</Typography>
                <Button startIcon={<Refresh />} onClick={() => refetch()}>
                    Refresh
                </Button>
            </Stack>
            <DataGrid
                rows={rows}
                columns={columns}
                rowHeight={70}
                disableRowSelectionOnClick
                sx={{
                    border: 0,
                    flex: 1, // Ensure it fills the container
                    '& .MuiDataGrid-cell': {
                        display: 'flex',
                        alignItems: 'center',
                    },
                    '& .MuiDataGrid-cell:focus': {
                        outline: 'none',
                    },
                    '& .MuiDataGrid-columnHeader:focus': {
                        outline: 'none',
                    },
                }}
                getRowId={(row) => row.Id}
                loading={isContainersPending || isTunnelsPending}
                hideFooter={true}
                slots={{
                    noRowsOverlay: CustomNoRowsOverlay
                }}
            />
        </>
    )
}
import { AddRounded, CopyAll, DeleteOutline, DeleteOutlineRounded, Edit, MoreVertRounded, OpenInNew, StopRounded, VisibilityRounded } from "@mui/icons-material";
import { Box, Divider, IconButton, Link, ListItemIcon, ListItemText, Menu, MenuItem, Stack, Tooltip, Typography } from "@mui/material";
import { GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import { useState } from "react";
import { Tunnel, useDeleteTunnel, useStopTunnel } from "../../features/tunnels/hooks";
import { ddClient } from "../../hooks/use-docker-desktop-client";
import { CreateTunnelModal } from "./CreateTunnelModal";
import { Container } from "./hooks";

type ContainerWithTunnel = Container & { tunnel?: Tunnel };

export const columns: GridColDef<ContainerWithTunnel>[] = [
    {
        field: 'name',
        headerName: 'Container',
        flex: 1.5,
        minWidth: 200,
        valueGetter: (value, row) => {
            return row.Names[0]?.replace(/^\//, '') || row.Id.substring(0, 12);
        },
        renderCell: (params: GridRenderCellParams) => (
            <Stack spacing={0.5} py={1} justifyContent="center" height="100%">
                <Typography variant="body2" fontWeight="medium" lineHeight={1.2}>
                    {params.value}
                </Typography>
            </Stack>
        )
    },
    {
        field: 'port',
        headerName: 'Port',
        width: 100,
        valueGetter: (value, row) => {
            const internalPort = row.Ports?.find(p => p.PrivatePort);
            const externalPort = row.Ports?.find(p => p.PublicPort);

            return {
                external: externalPort?.PublicPort,
                internal: internalPort?.PrivatePort
            }
        },
        renderCell: (params: GridRenderCellParams<Container>) => {
            const { external = "-", internal = "-" } = params.value;
            return <Link component="button" variant="caption" onClick={() => ddClient.host.openExternal(`http://localhost:${external}`)}>
                {external}:{internal}
            </Link>
        }
    },
    {
        field: 'url',
        headerName: 'URL',
        flex: 1,
        minWidth: 150,
        renderCell: (params: GridRenderCellParams<Container>) => {
            return <TunnelUrl container={params.row} />
        }
    },
    {
        field: 'actions',
        headerName: 'Actions',
        sortable: false,
        align: 'center',
        headerAlign: 'center',
        flex: 1,
        renderCell: (params: GridRenderCellParams<Container>) => (
            <TunnelActions container={params.row} />
        )
    },
];


function TunnelUrl({ container }: { container: Container }) {
    const tunnelUrl = container.tunnel?.url;

    const handleClick = () => {
        if (tunnelUrl) {
            ddClient.host.openExternal(tunnelUrl);
        }
    }
    return <Link component="button" onClick={handleClick} variant="body2">
        {tunnelUrl}
    </Link>

}

export function TunnelActions({ container }: { container: ContainerWithTunnel }) {
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const stopTunnel = useStopTunnel();
    const deleteTunnel = useDeleteTunnel();
    const tunnel = container.tunnel;


    function handleStopTunnel() {
        if (tunnel) {
            stopTunnel.mutate(container.Id, {
                onSuccess: () => {
                    ddClient.desktopUI.toast.success('Tunnel stopped successfully');
                },
                onError: (err) => {
                    ddClient.desktopUI.toast.error(`Failed to stop tunnel: ${err.message}`);
                }
            });
        }
    }

    function handleOpen(event: React.MouseEvent<HTMLElement>) {
        setAnchorEl(event.currentTarget);
    }

    function handleClose() {
        setAnchorEl(null);
    }

    function handleCopyUrl() {
        if (tunnel?.url) {
            navigator.clipboard.writeText(tunnel.url);
            ddClient.desktopUI.toast.success('URL copied to clipboard');
        }
        handleClose();
    }

    function handleOpenUrl() {
        if (tunnel?.url) {
            ddClient.host.openExternal(tunnel.url);
        }
        handleClose();
    }

    function handleInspect() {
        ddClient.desktopUI.navigate.viewContainer(container.Id);
        handleClose();
    }

    function handleEdit() {
        setModalOpen(true);
        handleClose();
    }

    function handleDelete() {
        if (tunnel) {
            deleteTunnel.mutate(container.Id, {
                onSuccess: () => {
                    ddClient.desktopUI.toast.success('Tunnel deleted successfully');
                },
                onError: (err) => {
                    ddClient.desktopUI.toast.error(`Failed to delete tunnel: ${err.message}`);
                }
            });
        }
        handleClose();
    }

    function handleCreate() {
        setCreateModalOpen(true);
        handleClose();
    }

    const open = Boolean(anchorEl);

    return <>
        <Box sx={{ display: 'flex', gap: 1 }}>
            {tunnel?.status === "online" ?
                <Tooltip title="Stop Tunnel">
                    <IconButton onClick={handleStopTunnel} size="small">
                        <StopRounded />
                    </IconButton>
                </Tooltip>
                : <Tooltip title="Create Tunnel">
                    <IconButton onClick={handleCreate} size="small">
                        <AddRounded />
                    </IconButton>
                </Tooltip>
            }


            <Tooltip title="Show Container Actions">
                <IconButton onClick={handleOpen} size="small">
                    <MoreVertRounded />
                </IconButton>
            </Tooltip>

            {tunnel && <Tooltip title="Delete Tunnel">
                <IconButton color="error" onClick={handleDelete} size="small">
                    <DeleteOutlineRounded />
                </IconButton>
            </Tooltip>}
        </Box>


        <Menu
            anchorEl={anchorEl}
            open={open}
            onClose={handleClose}
            slotProps={{
                'list': {
                    "aria-labelledby": "basic-button"
                }
            }}
            anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
            }}
            transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
            }}
        >
            {tunnel?.url ? (
                <>
                    <MenuItem onClick={handleCopyUrl}>
                        <ListItemIcon>
                            <CopyAll fontSize="small" />
                        </ListItemIcon>
                        <ListItemText>Copy URL</ListItemText>
                    </MenuItem>
                    <MenuItem onClick={handleOpenUrl}>
                        <ListItemIcon>
                            <OpenInNew fontSize="small" />
                        </ListItemIcon>
                        <ListItemText>Open in Browser</ListItemText>
                    </MenuItem>
                    <Divider />
                    <MenuItem onClick={handleEdit}>
                        <ListItemIcon>
                            <Edit fontSize="small" />
                        </ListItemIcon>
                        <ListItemText>Edit Configuration</ListItemText>
                    </MenuItem>
                    <MenuItem onClick={handleDelete}>
                        <ListItemIcon>
                            <DeleteOutline fontSize="small" color="error" />
                        </ListItemIcon>
                        <ListItemText primaryTypographyProps={{ color: 'error' }}>Delete Tunnel</ListItemText>
                    </MenuItem>
                    <Divider />
                </>
            ) : (
                <>
                    <MenuItem onClick={handleCreate}>
                        <ListItemIcon>
                            <AddRounded fontSize="small" />
                        </ListItemIcon>
                        <ListItemText>Create Tunnel</ListItemText>
                    </MenuItem>
                    <Divider />
                </>
            )}
            <MenuItem onClick={handleInspect}>
                <ListItemIcon>
                    <VisibilityRounded fontSize="small" />
                </ListItemIcon>
                <ListItemText>Inspect Container</ListItemText>
            </MenuItem>
        </Menu>

        <CreateTunnelModal open={createModalOpen} onOpenChange={setCreateModalOpen} container={container} />
        <CreateTunnelModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            container={container}
            initialValues={tunnel ? {
                port: tunnel.port,
                subdomain: tunnel.subdomain
            } : undefined}
        />
    </>
}
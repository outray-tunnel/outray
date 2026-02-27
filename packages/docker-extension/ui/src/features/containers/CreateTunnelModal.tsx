import { Dialog, DialogTitle, DialogContent, DialogContentText, Box, DialogActions, Button, TextField, FormControl, InputLabel, Select, MenuItem, Alert } from "@mui/material";
import { useState } from "react";
import { useCreateTunnel } from "../../features/tunnels/hooks";
import { useApiKey } from "../../features/api-keys/hooks";
import { Container } from "./hooks";

type CreateTunnelModalProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    container: Container | null;
    initialValues?: {
        port: number;
        subdomain?: string;
    };
}

export function CreateTunnelModal({ open, onOpenChange, container, initialValues }: CreateTunnelModalProps) {
    const { data: apiKey } = useApiKey();
    const createTunnel = useCreateTunnel();

    const [selectedPort, setSelectedPort] = useState<number | ''>(initialValues?.port || '');
    const [subdomain, setSubdomain] = useState(initialValues?.subdomain || '');

    function handleCreate() {
        if (!container || !selectedPort) return;

        createTunnel.mutate({
            containerId: container.Id,
            port: Number(selectedPort),
            subdomain: subdomain || undefined,
        }, {
            onSuccess: () => {
                onOpenChange(false)
            }
        });

    };

    const handleClose = (event: {}, reason: "backdropClick" | "escapeKeyDown") => {
        if (createTunnel.isPending && (reason === 'backdropClick' || reason === 'escapeKeyDown')) {
            return;
        }
        onOpenChange(false);
    };

    if (!container) return null;

    const publicPorts = container.Ports.filter(p => p.PublicPort).reduce((acc, current) => {
        if (!acc.some(p => p.PublicPort === current.PublicPort)) {
            acc.push(current);
        }
        return acc;
    }, [] as typeof container.Ports);
    const isEdit = !!initialValues;

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>{isEdit ? 'Update Tunnel' : 'Expose Container'}</DialogTitle>
            <DialogContent>
                <DialogContentText sx={{ mb: 2 }}>
                    {isEdit
                        ? <>Update the tunnel configuration for <strong>{container.Names[0]?.replace(/^\//, '')}</strong>.</>
                        : <>Create an Outray tunnel to expose <strong>{container.Names[0]?.replace(/^\//, '')}</strong> to the internet.</>
                    }
                </DialogContentText>

                <Box component="form" onSubmit={handleCreate} display="flex" flexDirection="column" gap={3} pt={1}>
                    {createTunnel.error && <Alert severity="error">{createTunnel.error.message}</Alert>}

                    <FormControl fullWidth>
                        <InputLabel id="port-select-label">Local Port</InputLabel>
                        <Select
                            labelId="port-select-label"
                            value={selectedPort}
                            label="Local Port"
                            onChange={(e) => setSelectedPort(Number(e.target.value))}
                        >
                            {publicPorts.length > 0 ? (
                                publicPorts.map((p) => (
                                    <MenuItem key={p.PublicPort} value={p.PublicPort}>
                                        {p.PublicPort} ({p.Type})
                                    </MenuItem>
                                ))
                            ) : (
                                <MenuItem disabled value="">
                                    No public ports exposed
                                </MenuItem>
                            )}
                        </Select>
                    </FormControl>

                    <TextField
                        label="Subdomain (optional)"
                        placeholder="my-awesome-app"
                        fullWidth
                        value={subdomain}
                        onChange={(e) => setSubdomain(e.target.value)}
                        helperText="Keep empty for a random subdomain"
                    />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button variant="outlined" onClick={() => onOpenChange(false)} disabled={createTunnel.isPending}>Cancel</Button>
                <Button
                    variant="contained"
                    type="submit"
                    onClick={handleCreate}
                    disabled={!selectedPort || !apiKey}
                    loading={createTunnel.isPending}
                >
                    {isEdit ? 'Update Tunnel' : 'Expose Container'}
                </Button>
            </DialogActions>
        </Dialog>
    )
}
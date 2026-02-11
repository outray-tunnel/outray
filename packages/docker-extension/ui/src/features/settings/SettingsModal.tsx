import { Dialog, DialogTitle, DialogContent, DialogContentText, Box, Typography, DialogActions, Button, Alert, IconButton, InputAdornment, FormControl, FormHelperText, InputLabel, Link, OutlinedInput } from "@mui/material";
import { useState } from "react";
import { useApiKey, useVerifyAndSaveApiKey } from "../../features/api-keys/hooks";
import { VisibilityOutlined, VisibilityOffOutlined, Key } from "@mui/icons-material";
import { useDockerDesktopClient } from "../../hooks/use-docker-desktop-client";


type SettingsModalProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
    const { data } = useApiKey();
    const verifyAndSave = useVerifyAndSaveApiKey();
    const client = useDockerDesktopClient();

    const [localKey, setLocalKey] = useState(data?.apiKey || '');
    const [showApiKey, setShowApiKey] = useState(false);


    function onClose() {
        setLocalKey(data?.apiKey || '');
        onOpenChange(false);
    }


    function handleVerifyAndSave(e: React.FormEvent<HTMLDivElement>) {
        e.preventDefault();
        verifyAndSave.mutate(localKey, {
            onSuccess: () => {
                setTimeout(() => {
                    onOpenChange(false);
                }, 1000);
            }
        });
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth component="form" onSubmit={handleVerifyAndSave}>
            <DialogTitle>Outray Settings</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    Configure your Outray extension settings here. You can find your API key in the Outray Dashboard.
                </DialogContentText>
                <Box pt={2} display="flex" flexDirection="column" gap={2}>
                    <Typography variant="subtitle2">
                        API Configuration
                    </Typography>

                    <FormControl fullWidth variant="outlined">
                        <InputLabel htmlFor="api-key-input">API Key</InputLabel>
                        <OutlinedInput
                            id="api-key-input"
                            label="API Key"
                            placeholder="outray_..."
                            value={localKey}
                            onChange={e => setLocalKey(e.target.value)}
                            type={showApiKey ? "text" : "password"}
                            startAdornment={
                                <InputAdornment position="start">
                                    <Key color="action" />
                                </InputAdornment>
                            }
                            endAdornment={
                                <InputAdornment position="end">
                                    <IconButton
                                        aria-label="toggle api key visibility"
                                        onClick={() => setShowApiKey(!showApiKey)}
                                        edge="end"
                                    >
                                        {showApiKey ? <VisibilityOutlined /> : <VisibilityOffOutlined />}
                                    </IconButton>
                                </InputAdornment>
                            }
                        />
                        <FormHelperText>
                            Don't have an API key? <Link type="button" component="button" onClick={() => {
                                client.host.openExternal("https://outray.dev");
                            }} >Get one here</Link>
                        </FormHelperText>
                    </FormControl>


                    {verifyAndSave.error && (
                        <Alert severity="error">{verifyAndSave.error.message}</Alert>
                    )}
                    {verifyAndSave.isSuccess && (
                        <Alert severity="success">API Key verified and saved successfully!</Alert>
                    )}

                </Box>
            </DialogContent>
            <DialogActions>
                <Button type="button" variant="outlined" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button
                    type="submit"
                    loading={verifyAndSave.isPending}
                    variant="contained"
                    disabled={verifyAndSave.isPending || !localKey}
                >
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    )
}

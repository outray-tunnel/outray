import { Box, Button, FormControl, FormHelperText, IconButton, InputAdornment, InputLabel, Link, OutlinedInput, Stack, Typography, Container, Alert } from "@mui/material";
import { useState } from "react";
import { VisibilityOutlined, VisibilityOffOutlined, Key } from "@mui/icons-material";
import { useNavigate, Navigate } from "react-router-dom";
import { useApiKey, useVerifyAndSaveApiKey } from "../features/api-keys/hooks";
import { useDockerDesktopClient } from "../hooks/use-docker-desktop-client";

import wordmark from '../assets/wordmark.png';

export function Index() {
    const [apiKey, setApiKey] = useState<string>("")
    const [showApiKey, setShowApiKey] = useState<boolean>(false)
    const navigate = useNavigate();
    const verifyAndSaveApiKey = useVerifyAndSaveApiKey();
    const apiKeyQuery = useApiKey()
    const client = useDockerDesktopClient();

    if (apiKeyQuery.isPending) {
        return null
    }


    if (apiKeyQuery.data?.apiKey?.startsWith("outray_")) {
        return <Navigate to="/dashboard" />
    }



    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        verifyAndSaveApiKey.mutate(apiKey, {
            onSuccess: () => {
                navigate("/dashboard");
            },
            onError: (error: Error) => {
                client.desktopUI.toast.error(error.message);
            }
        });
    }



    return (
        <Container maxWidth="sm">
            <Stack height="100vh" alignItems="center" justifyContent="center" spacing={4}>

                <Stack spacing={2} alignItems="center" width="100%">
                    <img src={wordmark} alt="Outray" style={{ width: "auto", height: "64px", objectFit: "contain" }} />
                    <Typography variant="body1" color="text.secondary" textAlign="center">
                        Enter your API key to connect your Docker Desktop extension.
                    </Typography>
                </Stack>

                <Box component="form" noValidate autoComplete="off" onSubmit={handleSubmit} width="100%">
                    <Stack spacing={3}>
                        {verifyAndSaveApiKey.isError && (
                            <Alert severity="error">
                                {verifyAndSaveApiKey.error.message}
                            </Alert>
                        )}
                        <FormControl fullWidth variant="outlined">
                            <InputLabel htmlFor="api-key-input">API Key</InputLabel>
                            <OutlinedInput
                                id="api-key-input"
                                label="API Key"
                                placeholder="outray_..."
                                value={apiKey}
                                onChange={e => setApiKey(e.target.value)}
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

                        <Button
                            variant="contained"
                            size="large"
                            type="submit"
                            fullWidth
                            disabled={!apiKey}
                            loading={verifyAndSaveApiKey.isPending}
                        >
                            Connect
                        </Button>
                    </Stack>
                </Box>
            </Stack>

        </Container >
    );
}
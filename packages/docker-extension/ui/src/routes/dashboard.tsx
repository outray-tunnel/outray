import {
    Settings as SettingsIcon
} from "@mui/icons-material";
import {
    Container, IconButton, Stack
} from "@mui/material";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useApiKey } from "../features/api-keys/hooks";
import { ContainersTable } from "../features/containers/table";
import { SettingsModal } from "../features/settings/SettingsModal";

import wordmark from '../assets/wordmark.png';

export function Dashboard() {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const apiKeyQuery = useApiKey()

    if (!apiKeyQuery.data?.apiKey && !apiKeyQuery.isPending) {
        return <Navigate to="/" />
    }

    return (
        <Stack height="100vh" bgcolor="background.default" overflow="hidden">
            {/* Header */}
            <Container maxWidth="xl">
                <Stack direction="row" alignItems="center" justifyContent="space-between" height={64}>
                    <img src={wordmark} style={{ height: 32, width: "auto", objectFit: "contain" }} alt="Outray" />

                    <IconButton onClick={() => setSettingsOpen(true)}>
                        <SettingsIcon />
                    </IconButton>
                </Stack>
            </Container>

            {/* Main Content */}
            <Container maxWidth="xl" sx={{ mt: 4, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', pb: 4 }}>
                <ContainersTable />
            </Container>

            <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
        </Stack>
    );
}
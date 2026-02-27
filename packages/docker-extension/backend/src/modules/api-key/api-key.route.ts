import { Router } from "express";
import { apiKeyController } from "./api-key.controller";
import { validate } from "../middleware/validate";
import { apiKeySchema } from "./api-key.schema";

const router = Router();

router.get("/", apiKeyController.getApiKey);
router.post("/", validate(apiKeySchema), apiKeyController.verifyAndSaveApiKey);

export default router;
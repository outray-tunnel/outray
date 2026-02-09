import { Router } from "express";
import { tunnelController } from "./tunnel.controller";
import { validate } from "../middleware/validate";
import { containerIdSchema, createTunnelSchema } from "./tunnel.schema";

const router = Router();

router.get("/", tunnelController.getAll);
router.post("/", validate(createTunnelSchema), tunnelController.create);
router.get("/:containerId", validate(containerIdSchema), tunnelController.getOne);
router.put("/:containerId/stop", validate(containerIdSchema), tunnelController.stopTunnel);
router.delete("/:containerId", validate(containerIdSchema), tunnelController.deleteTunnel);

export default router;

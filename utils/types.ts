import { z } from "zod";
import { SaveActionSchema } from "./db";

export type SaveActionObject = z.infer<typeof SaveActionSchema>;



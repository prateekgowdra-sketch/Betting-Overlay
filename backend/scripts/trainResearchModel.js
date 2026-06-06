import { researchModelService } from "../services/researchModelService.js";

const statusBefore = researchModelService.getStatus();
const result = researchModelService.trainModel();
const statusAfter = researchModelService.getStatus();

console.log(JSON.stringify({
  statusBefore,
  result,
  statusAfter
}, null, 2));

import { PositionStatus } from "./types";

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

export function statusLabel(status: PositionStatus): string {
  switch (status) {
    case "won":
      return "Cashing";
    case "on-track":
      return "On Track";
    case "sweating":
      return "Sweating";
    case "danger":
      return "Danger";
    case "lost":
      return "Lost";
  }
}

export function statusColor(status: PositionStatus): string {
  switch (status) {
    case "won":
      return "#27c07d";
    case "on-track":
      return "#4fd694";
    case "sweating":
      return "#f7c948";
    case "danger":
      return "#ff8a65";
    case "lost":
      return "#f15b5b";
  }
}

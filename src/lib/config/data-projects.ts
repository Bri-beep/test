import dataProjects from "../../../config/data-projects.json";

export const allowedDataProjects = dataProjects.allowed as readonly string[];

export function isAllowedDataProject(value: string): boolean {
  return allowedDataProjects.includes(value);
}

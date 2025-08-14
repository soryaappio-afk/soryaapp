/* Shared definitions for AppBundle and AppFile with enforced JSON Schema */
export type AppRuntime = "web-standalone" | "web-esm-cdn" | "web-vite";

export interface AppFile {
    /* Relative path within the virtual bundle */
    path: string;
    /* MIME type of file */
    mime: string;
    /* File content (UTF-8 text or base64 data) */
    content: string;
    /* Optional encoding (default utf8) */
    encoding?: "utf8" | "base64";
}

export interface AppBundle {
    /* Target runtime environment */
    runtime: AppRuntime;
    /* Entry HTML file path */
    entry: string;
    /* Optional title for UX */
    title?: string;
    /* Optional preview instructions */
    previewInstructions?: string;
    /* Collection of files */
    files: AppFile[];
}

/* JSON Schema object (must remain identical to user supplied schema) */
export const APP_BUNDLE_JSON_SCHEMA: any = {
    type: "object",
    required: ["runtime", "entry", "files"],
    properties: {
        runtime: { type: "string", enum: ["web-standalone", "web-esm-cdn", "web-vite"] },
        entry: { type: "string", description: "Path to the entry HTML file" },
        title: { type: "string" },
        previewInstructions: { type: "string" },
        files: {
            type: "array",
            items: {
                type: "object",
                required: ["path", "content", "mime"],
                properties: {
                    path: { type: "string" },
                    mime: { type: "string", enum: ["text/html", "text/css", "text/javascript", "application/json", "image/svg+xml", "image/png", "image/jpeg"] },
                    content: { type: "string" },
                    encoding: { type: "string", enum: ["utf8", "base64"], default: "utf8" }
                }
            }
        }
    },
    additionalProperties: false
};

/* Minimal runtime validator (schema is simple; avoid external deps) */
export function validateAppBundle(data: any): { ok: boolean; errors?: string[] } {
    const errs: string[] = [];
    if (typeof data !== "object" || data === null) errs.push("root must be object");
    const req = ["runtime", "entry", "files"];
    for (const k of req) if (!(k in data)) errs.push(`missing required: ${k}`);
    if (data.runtime && !["web-standalone", "web-esm-cdn", "web-vite"].includes(data.runtime)) errs.push("invalid runtime");
    if (data.files && !Array.isArray(data.files)) errs.push("files must be array");
    if (Array.isArray(data.files)) {
        data.files.forEach((f: any, i: number) => {
            if (typeof f !== "object" || f === null) errs.push(`files[${i}] not object`);
            else {
                for (const fk of ["path", "content", "mime"]) if (!(fk in f)) errs.push(`files[${i}] missing ${fk}`);
            }
        });
    }
    return { ok: errs.length === 0, errors: errs.length ? errs : undefined };
}

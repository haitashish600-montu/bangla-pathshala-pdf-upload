// Bangla Pathshala PDF Upload Worker
// Dedicated to PDF uploads only. Push Notification Worker is separate.
// Required Variables:
// CLOUDINARY_CLOUD_NAME
// CLOUDINARY_UPLOAD_PRESET

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
  "Vary": "Origin"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    console.log("BP_PDF_REQUEST", {
      method: request.method,
      origin: request.headers.get("Origin") || "(none)",
      contentType: request.headers.get("Content-Type") || "(none)",
      path: url.pathname,
      query: url.search
    });

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS
      });
    }

    if (request.method === "GET") {
      return json({
        success: true,
        message: "Bangla Pathshala PDF Upload Worker is ready"
      });
    }

    if (request.method !== "POST") {
      return json({
        success: false,
        error: "Method not allowed"
      }, 405);
    }

    try {
      if (
        !env.CLOUDINARY_CLOUD_NAME ||
        !env.CLOUDINARY_UPLOAD_PRESET
      ) {
        throw new Error(
          "Cloudinary configuration missing: check Worker Variables"
        );
      }

      const form = await request.formData();
      const file = form.get("file");

      if (!file || typeof file === "string") {
        throw new Error("PDF file not found in POST form data");
      }

      if (
        file.type !== "application/pdf" &&
        !/\.pdf$/i.test(file.name || "")
      ) {
        throw new Error("Only PDF files are allowed");
      }

      if (file.size <= 0) {
        throw new Error("Selected PDF is empty");
      }

      if (file.size > 25 * 1024 * 1024) {
        throw new Error("PDF size must be below 25 MB");
      }

      console.log("BP_PDF_FILE_RECEIVED", {
        name: file.name,
        size: file.size,
        type: file.type
      });

      const upload = new FormData();
      upload.append("file", file, file.name || "document.pdf");
      upload.append(
        "upload_preset",
        env.CLOUDINARY_UPLOAD_PRESET
      );

      const cloudinary = await fetch(
        `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/raw/upload`,
        {
          method: "POST",
          body: upload
        }
      );

      const raw = await cloudinary.text();

      let result = {};
      try {
        result = raw ? JSON.parse(raw) : {};
      } catch (_) {}

      if (!cloudinary.ok || !result.secure_url) {
        const detail =
          result?.error?.message ||
          raw.slice(0, 300) ||
          `HTTP ${cloudinary.status}`;

        console.error("BP_CLOUDINARY_ERROR", {
          status: cloudinary.status,
          detail
        });

        return json({
          success: false,
          error: `Cloudinary upload failed (${cloudinary.status}): ${detail}`
        }, 502);
      }

      console.log("BP_PDF_UPLOAD_SUCCESS", {
        public_id: result.public_id,
        bytes: file.size
      });

      return json({
        success: true,
        url: result.secure_url,
        public_id: result.public_id || "",
        message: "PDF uploaded successfully"
      });

    } catch (error) {
      const message =
        error?.message || "PDF upload failed";

      console.error("BP_PDF_UPLOAD_ERROR", message);

      return json({
        success: false,
        error: message
      }, 400);
    }
  }
};

// Bangla Pathshala PDF Upload Worker
// Native HTML form upload mode avoids browser fetch CORS/preflight failures.
// Only PDF uploads are handled here. Push Notification Worker is separate.

const ALLOWED_ORIGIN = "https://haitashish600-montu.github.io";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function formResultResponse(data, status = 200) {
  const safe = JSON.stringify(data).replace(/</g, "\\u003c");

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body>
<script>
parent.postMessage(
  ${safe},
  ${JSON.stringify(ALLOWED_ORIGIN)}
);
</script>
</body>
</html>`;

  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;
    const formMode = url.searchParams.get("bp_form_upload") === "1";
    const requestId = url.searchParams.get("request_id") || "";
    const origin = request.headers.get("Origin") || "";

    console.log("PDF upload request", {
      method,
      formMode,
      origin: origin || "(none)",
      contentType: request.headers.get("Content-Type") || "",
      contentLength: request.headers.get("Content-Length") || ""
    });

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    if (method === "GET") {
      return jsonResponse({
        success: true,
        message: "Bangla Pathshala PDF Upload Worker is ready"
      });
    }

    if (method !== "POST") {
      return formMode
        ? formResultResponse({
            type: "BP_PDF_UPLOAD_RESULT",
            requestId,
            success: false,
            error: "Method not allowed"
          }, 405)
        : jsonResponse({
            success: false,
            error: "Method not allowed"
          }, 405);
    }

    try {
      if (origin && origin !== ALLOWED_ORIGIN) {
        throw new Error("Origin not allowed");
      }

      if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_UPLOAD_PRESET) {
        throw new Error("Cloudinary configuration missing");
      }

      const incoming = await request.formData();
      const file = incoming.get("file");

      if (!file || typeof file === "string") {
        throw new Error("PDF file not found in form field 'file'");
      }

      if (
        file.type !== "application/pdf" &&
        !/\.pdf$/i.test(file.name || "")
      ) {
        throw new Error("Only PDF files are allowed");
      }

      if (file.size > 25 * 1024 * 1024) {
        throw new Error("PDF size must be below 25 MB");
      }

      const uploadForm = new FormData();

      uploadForm.append(
        "file",
        file,
        file.name || "document.pdf"
      );

      uploadForm.append(
        "upload_preset",
        env.CLOUDINARY_UPLOAD_PRESET
      );

      const cloudinaryResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/raw/upload`,
        {
          method: "POST",
          body: uploadForm
        }
      );

      const raw = await cloudinaryResponse.text();

      let result = {};

      try {
        result = raw ? JSON.parse(raw) : {};
      } catch (_) {}

      if (!cloudinaryResponse.ok || !result.secure_url) {
        throw new Error(
          result.error?.message ||
          `Cloudinary upload failed (HTTP ${cloudinaryResponse.status})`
        );
      }

      console.log("PDF uploaded successfully", {
        publicId: result.public_id || "",
        size: file.size
      });

      const success = {
        type: "BP_PDF_UPLOAD_RESULT",
        requestId,
        success: true,
        url: result.secure_url,
        public_id: result.public_id || ""
      };

      return formMode
        ? formResultResponse(success)
        : jsonResponse({
            success: true,
            url: result.secure_url,
            public_id: result.public_id,
            message: "PDF uploaded successfully"
          });

    } catch (error) {
      const message = error?.message || "PDF upload failed";

      console.error("PDF upload failed", {
        error: message
      });

      const failure = {
        type: "BP_PDF_UPLOAD_RESULT",
        requestId,
        success: false,
        error: message
      };

      return formMode
        ? formResultResponse(failure, 400)
        : jsonResponse({
            success: false,
            error: message
          }, 400);
    }
  }
};

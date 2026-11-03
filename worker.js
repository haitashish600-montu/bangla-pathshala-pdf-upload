
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "https://haitashish600-montu.github.io",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json"
    }
  });
}

function formResponse(data, requestId) {
  const message = {
    type: "BP_PDF_UPLOAD_RESULT",
    requestId,
    ...data
  };

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body>
<script>
window.parent.postMessage(
  ${JSON.stringify(message)},
  "https://haitashish600-montu.github.io"
);
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
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
    const isFormUpload = url.searchParams.get("bp_form_upload") === "1";
    const requestId = url.searchParams.get("request_id") || "";

    const respond = (data, status = 200) => {
      return isFormUpload
        ? formResponse(data, requestId)
        : jsonResponse(data, status);
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    if (request.method === "GET") {
      return jsonResponse({
        success: true,
        message: "Bangla Pathshala PDF Upload Worker is ready"
      });
    }

    if (request.method !== "POST") {
      return respond({
        success: false,
        error: "Method not allowed"
      }, 405);
    }

    try {
      if (
        !env.CLOUDINARY_CLOUD_NAME ||
        !env.CLOUDINARY_UPLOAD_PRESET
      ) {
        throw new Error("Cloudinary configuration missing");
      }

      const form = await request.formData();
      const file = form.get("file");

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
      uploadForm.append("file", file, file.name || "document.pdf");
      uploadForm.append("upload_preset", env.CLOUDINARY_UPLOAD_PRESET);

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

      return respond({
        success: true,
        url: result.secure_url,
        public_id: result.public_id,
        message: "PDF uploaded successfully"
      });

    } catch (error) {
      return respond({
        success: false,
        error: error?.message || "PDF upload failed"
      }, 400);
    }
  }
};

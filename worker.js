// Bangla Pathshala PDF Upload Worker
// Handles Suggestion PDF, Past Year Paper and Study Material.
// Push Notification Worker is separate and is not changed.

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
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

export default {
  async fetch(request, env) {
    const method = request.method;

    console.log("PDF upload request", {
      method,
      origin: request.headers.get("Origin") || "(none)",
      contentType: request.headers.get("Content-Type") || "",
      requestedMethod:
        request.headers.get("Access-Control-Request-Method") || "",
      requestedHeaders:
        request.headers.get("Access-Control-Request-Headers") || ""
    });

    // CORS Preflight
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    // Worker connection test
    if (method === "GET") {
      return jsonResponse({
        success: true,
        message: "Bangla Pathshala PDF Upload Worker is ready"
      });
    }

    if (method !== "POST") {
      return jsonResponse({
        success: false,
        error: "Method not allowed"
      }, 405);
    }

    try {
      // Check Cloudinary configuration
      if (
        !env.CLOUDINARY_CLOUD_NAME ||
        !env.CLOUDINARY_UPLOAD_PRESET
      ) {
        throw new Error("Cloudinary configuration missing");
      }

      // Read uploaded PDF
      const form = await request.formData();
      const file = form.get("file");

      if (!file || typeof file === "string") {
        throw new Error(
          "PDF file not found in form field 'file'"
        );
      }

      // Validate PDF
      if (
        file.type !== "application/pdf" &&
        !/\.pdf$/i.test(file.name || "")
      ) {
        throw new Error("Only PDF files are allowed");
      }

      // Maximum file size: 25 MB
      if (file.size > 25 * 1024 * 1024) {
        throw new Error("PDF size must be below 25 MB");
      }

      // Prepare Cloudinary upload
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

      // Upload PDF to Cloudinary
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
      } catch (_) {
        result = {};
      }

      if (
        !cloudinaryResponse.ok ||
        !result.secure_url
      ) {
        throw new Error(
          result.error?.message ||
          `Cloudinary upload failed (HTTP ${cloudinaryResponse.status})`
        );
      }

      console.log("PDF uploaded successfully", {
        publicId: result.public_id || ""
      });

      // Successful response
      return jsonResponse({
        success: true,
        url: result.secure_url,
        public_id: result.public_id,
        message: "PDF uploaded successfully"
      });

    } catch (error) {
      console.error("PDF upload failed", {
        error: error?.message || String(error)
      });

      return jsonResponse({
        success: false,
        error: error?.message || "PDF upload failed"
      }, 400);
    }
  }
};

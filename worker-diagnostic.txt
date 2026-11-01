const ALLOWED_ORIGIN = "https://haitashish600-montu.github.io";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const method = request.method;
    const url = new URL(request.url);

    console.log("PDF Worker request", {
      method,
      origin: origin || "(no Origin header)",
      pathname: url.pathname,
      contentType: request.headers.get("Content-Type") || "",
      contentLength: request.headers.get("Content-Length") || ""
    });

    if (origin && origin !== ALLOWED_ORIGIN) {
      console.error("PDF Worker rejected request: origin mismatch", {
        receivedOrigin: origin,
        allowedOrigin: ALLOWED_ORIGIN,
        method
      });
      return jsonResponse({
        success: false,
        error: "Origin not allowed",
        diagnostic: "ORIGIN_MISMATCH"
      }, 403);
    }

    if (method === "OPTIONS") {
      console.log("PDF Worker preflight request accepted");
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (method === "GET") {
      return jsonResponse({
        success: true,
        message: "Bangla Pathshala PDF Upload Worker is ready"
      });
    }

    if (method !== "POST") {
      return jsonResponse({
        success: false,
        error: "Method not allowed",
        diagnostic: "METHOD_NOT_ALLOWED"
      }, 405);
    }

    try {
      console.log("PDF Worker POST received; checking Cloudinary configuration");

      if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_UPLOAD_PRESET) {
        console.error("PDF Worker configuration missing", {
          hasCloudName: Boolean(env.CLOUDINARY_CLOUD_NAME),
          hasUploadPreset: Boolean(env.CLOUDINARY_UPLOAD_PRESET)
        });
        throw new Error("Cloudinary configuration missing");
      }

      const incoming = await request.formData();
      const file = incoming.get("file");

      if (!file || typeof file === "string") throw new Error("PDF file not found");

      console.log("PDF Worker received file", {
        fileName: file.name || "(unnamed)",
        fileType: file.type || "(unknown)",
        fileSize: file.size
      });

      if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name || "")) {
        throw new Error("Only PDF files are allowed");
      }
      if (file.size > 25 * 1024 * 1024) {
        throw new Error("PDF size must be below 25 MB");
      }

      const uploadData = new FormData();
      uploadData.append("file", file, file.name || "document.pdf");
      uploadData.append("upload_preset", env.CLOUDINARY_UPLOAD_PRESET);

      console.log("PDF Worker sending file to Cloudinary");
      const cloudinaryResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/raw/upload`,
        { method: "POST", body: uploadData }
      );

      const responseText = await cloudinaryResponse.text();
      let result = {};
      try { result = responseText ? JSON.parse(responseText) : {}; } catch { result = {}; }

      if (!cloudinaryResponse.ok || !result.secure_url) {
        const message = result.error?.message ||
          `Cloudinary upload failed (HTTP ${cloudinaryResponse.status})`;
        console.error("Cloudinary upload rejected", {
          status: cloudinaryResponse.status,
          error: message
        });
        throw new Error(message);
      }

      console.log("PDF Worker upload completed successfully", {
        publicId: result.public_id || ""
      });

      return jsonResponse({
        success: true,
        url: result.secure_url,
        public_id: result.public_id,
        message: "PDF uploaded successfully"
      });
    } catch (error) {
      console.error("PDF Worker upload failed", {
        error: error?.message || "Unknown error"
      });
      return jsonResponse({
        success: false,
        error: error?.message || "PDF upload failed"
      }, 400);
    }
  }
};

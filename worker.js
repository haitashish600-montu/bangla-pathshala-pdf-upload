const ALLOWED_ORIGINS = new Set([
  "https://haitashish600-montu.github.io",
  "null"
]);

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json"
    }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const method = request.method;

    console.log("PDF upload request", {
      method,
      origin: origin || "(none)",
      contentType: request.headers.get("Content-Type") || ""
    });

    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      console.error("Rejected origin", { origin });
      return jsonResponse(
        { success: false, error: "Origin not allowed" },
        403,
        ""
      );
    }

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin)
      });
    }

    if (method === "GET") {
      return jsonResponse({
        success: true,
        message: "Bangla Pathshala PDF Upload Worker is ready"
      }, 200, origin);
    }

    if (method !== "POST") {
      return jsonResponse(
        { success: false, error: "Method not allowed" },
        405,
        origin
      );
    }

    try {
      if (
        !env.CLOUDINARY_CLOUD_NAME ||
        !env.CLOUDINARY_UPLOAD_PRESET
      ) {
        throw new Error("Cloudinary configuration missing");
      }

      const incoming = await request.formData();
      const file = incoming.get("file");

      if (!file || typeof file === "string") {
        throw new Error("PDF file not found");
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

      const uploadData = new FormData();
      uploadData.append(
        "file",
        file,
        file.name || "document.pdf"
      );
      uploadData.append(
        "upload_preset",
        env.CLOUDINARY_UPLOAD_PRESET
      );

      const cloudinaryResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/raw/upload`,
        {
          method: "POST",
          body: uploadData
        }
      );

      const responseText = await cloudinaryResponse.text();

      let result = {};
      try {
        result = responseText ? JSON.parse(responseText) : {};
      } catch {}

      if (!cloudinaryResponse.ok || !result.secure_url) {
        throw new Error(
          result.error?.message ||
          `Cloudinary upload failed (HTTP ${cloudinaryResponse.status})`
        );
      }

      console.log("PDF uploaded successfully", {
        publicId: result.public_id || ""
      });

      return jsonResponse({
        success: true,
        url: result.secure_url,
        public_id: result.public_id,
        message: "PDF uploaded successfully"
      }, 200, origin);

    } catch (error) {
      console.error("PDF upload failed", {
        error: error?.message || "Unknown error"
      });

      return jsonResponse({
        success: false,
        error: error?.message || "PDF upload failed"
      }, 400, origin);
    }
  }
};

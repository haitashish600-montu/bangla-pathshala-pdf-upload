const ALLOWED_ORIGIN = "https://haitashish600-montu.github.io";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (origin && origin !== ALLOWED_ORIGIN) {
      return new Response("Origin not allowed", { status: 403 });
    }

    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (request.method === "GET") {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Bangla Pathshala PDF Upload Worker is ready"
        }),
        { headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers
      });
    }

    try {
      if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_UPLOAD_PRESET) {
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
      uploadData.append("file", file, file.name);
      uploadData.append("upload_preset", env.CLOUDINARY_UPLOAD_PRESET);

      const cloudinaryResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/raw/upload`,
        {
          method: "POST",
          body: uploadData
        }
      );

      const result = await cloudinaryResponse.json();

      if (!cloudinaryResponse.ok || !result.secure_url) {
        throw new Error(
          result.error?.message || "Cloudinary upload failed"
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          url: result.secure_url,
          public_id: result.public_id,
          message: "PDF uploaded successfully"
        }),
        {
          status: 200,
          headers: {
            ...headers,
            "Content-Type": "application/json"
          }
        }
      );

    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "PDF upload failed"
        }),
        {
          status: 400,
          headers: {
            ...headers,
            "Content-Type": "application/json"
          }
        }
      );
    }
  }
};

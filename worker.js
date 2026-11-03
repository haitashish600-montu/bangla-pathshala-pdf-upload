// Bangla Pathshala PDF Upload Worker
// PDF uploads only. Push Notification Worker is separate.
// Required Production Variables:
// CLOUDINARY_CLOUD_NAME
// CLOUDINARY_UPLOAD_PRESET

const ALLOWED_ORIGIN = "https://haitashish600-montu.github.io";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    }
  });
}

function formResponse(data, status = 200) {
  const safeData = JSON.stringify(data).replace(/</g, "\\u003c");

  const page = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body>
<script>
(function () {
  var result = ${safeData};
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        result,
        ${JSON.stringify(ALLOWED_ORIGIN)}
      );
    }
  } catch (e) {}
})();
</script>
PDF upload response sent.
</body>
</html>`;

  return new Response(page, {
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
    const formMode = url.searchParams.get("bp_form_upload") === "1";
    const requestId = url.searchParams.get("request_id") || "";
    const origin = request.headers.get("Origin") || "";

    console.log("BP_PDF_REQUEST", {
      method: request.method,
      origin: origin || "(none)",
      contentType: request.headers.get("Content-Type") || "(none)",
      formMode,
      requestId
    });

    const respond = (data, status = 200) =>
      formMode
        ? formResponse(data, status)
        : jsonResponse(data, status);

    if (origin && origin !== ALLOWED_ORIGIN) {
      return respond({
        type: "BP_PDF_UPLOAD_RESULT",
        requestId,
        success: false,
        error: "এই Origin থেকে PDF upload অনুমোদিত নয়।"
      }, 403);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin"
        }
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
        type: "BP_PDF_UPLOAD_RESULT",
        requestId,
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
          "Cloudinary configuration missing: Production Variables পরীক্ষা করুন।"
        );
      }

      const incoming = await request.formData();
      const file = incoming.get("file");

      if (!file || typeof file === "string") {
        throw new Error("POST request-এ PDF file পাওয়া যায়নি।");
      }

      if (
        file.type !== "application/pdf" &&
        !/\.pdf$/i.test(file.name || "")
      ) {
        throw new Error("শুধু PDF ফাইল আপলোড করা যাবে।");
      }

      if (file.size <= 0) {
        throw new Error("নির্বাচিত PDF ফাইলটি খালি।");
      }

      if (file.size > 25 * 1024 * 1024) {
        throw new Error("PDF ফাইলের সাইজ ২৫ MB-এর মধ্যে হতে হবে।");
      }

      console.log("BP_PDF_FILE_RECEIVED", {
        requestId,
        name: file.name,
        size: file.size,
        type: file.type
      });

      const uploadForm = new FormData();
      uploadForm.append("file", file, file.name || "document.pdf");
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
      } catch (e) {}

      if (!cloudinaryResponse.ok || !result.secure_url) {
        const detail =
          result?.error?.message ||
          raw.slice(0, 300) ||
          `Cloudinary HTTP ${cloudinaryResponse.status}`;

        console.error("BP_CLOUDINARY_ERROR", {
          requestId,
          status: cloudinaryResponse.status,
          detail
        });

        throw new Error(
          `Cloudinary upload failed (${cloudinaryResponse.status}): ${detail}`
        );
      }

      console.log("BP_PDF_UPLOAD_SUCCESS", {
        requestId,
        public_id: result.public_id || "",
        bytes: file.size
      });

      return respond({
        type: "BP_PDF_UPLOAD_RESULT",
        requestId,
        success: true,
        url: result.secure_url,
        public_id: result.public_id || "",
        message: "PDF uploaded successfully"
      });

    } catch (error) {
      const message =
        error?.message || "PDF upload failed";

      console.error("BP_PDF_UPLOAD_ERROR", {
        requestId,
        message
      });

      return respond({
        type: "BP_PDF_UPLOAD_RESULT",
        requestId,
        success: false,
        error: message
      }, 400);
    }
  }
};

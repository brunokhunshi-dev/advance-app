const encoder = new TextEncoder();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function awsEncode(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    character =>
      "%" + character.charCodeAt(0).toString(16).toUpperCase()
  );
}

function hex(bytes) {
  return [...bytes]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(value) {
  return new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(value)
    )
  );
}

async function sha256Hex(value) {
  return hex(await sha256(value));
}

async function hmac(key, value) {
  const rawKey =
    typeof key === "string"
      ? encoder.encode(key)
      : key;

  const cryptoKey =
    await crypto.subtle.importKey(
      "raw",
      rawKey,
      {
        name: "HMAC",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );

  return new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      encoder.encode(value)
    )
  );
}

async function createPresignedUrl({
  env,
  method,
  key = "",
  contentType,
  expires = 300,
  queryParams = [],
}) {
  const host =
    env.R2_ACCOUNT_ID +
    ".r2.cloudflarestorage.com";

  const region = "auto";
  const service = "s3";
  const now = new Date();

  const amzDate = now
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "");

  const dateStamp =
    amzDate.slice(0, 8);

  const credentialScope =
    dateStamp +
    "/" + region +
    "/" + service +
    "/aws4_request";

  const pathParts = [
    env.R2_BUCKET_NAME,
    ...(key ? key.split("/") : []),
  ];

  const canonicalUri =
    "/" +
    pathParts
      .map(awsEncode)
      .join("/");

  const signedHeaders =
    contentType
      ? "content-type;host"
      : "host";

  const params = [
    ...queryParams.map(
      ([name, value]) => [
        String(name),
        String(value),
      ]
    ),
    [
      "X-Amz-Algorithm",
      "AWS4-HMAC-SHA256",
    ],
    [
      "X-Amz-Credential",
      env.R2_ACCESS_KEY_ID +
        "/" +
        credentialScope,
    ],
    [
      "X-Amz-Date",
      amzDate,
    ],
    [
      "X-Amz-Expires",
      String(expires),
    ],
    [
      "X-Amz-SignedHeaders",
      signedHeaders,
    ],
  ];

  params.sort((a, b) => {
    if (a[0] === b[0]) {
      return String(a[1]).localeCompare(
        String(b[1])
      );
    }
    return a[0].localeCompare(b[0]);
  });

  const canonicalQuery =
    params
      .map(
        ([name, value]) =>
          awsEncode(name) +
          "=" +
          awsEncode(value)
      )
      .join("&");

  let canonicalHeaders =
    "host:" + host + "\n";

  if (contentType) {
    canonicalHeaders =
      "content-type:" +
      contentType +
      "\n" +
      canonicalHeaders;
  }

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(
      canonicalRequest
    ),
  ].join("\n");

  const kDate =
    await hmac(
      "AWS4" +
        env.R2_SECRET_ACCESS_KEY,
      dateStamp
    );

  const kRegion =
    await hmac(
      kDate,
      region
    );

  const kService =
    await hmac(
      kRegion,
      service
    );

  const kSigning =
    await hmac(
      kService,
      "aws4_request"
    );

  const signature =
    hex(
      await hmac(
        kSigning,
        stringToSign
      )
    );

  return (
    "https://" +
    host +
    canonicalUri +
    "?" +
    canonicalQuery +
    "&X-Amz-Signature=" +
    signature
  );
}

/* ------------------------------
   FIREBASE AUTH
-------------------------------- */

async function authenticate(
  request,
  env
) {
  const authorization =
    request.headers.get(
      "Authorization"
    ) || "";

  if (
    !authorization.startsWith(
      "Bearer "
    )
  ) {
    throw new Response(
      "Unauthorized",
      { status: 401 }
    );
  }

  const idToken =
    authorization.slice(7);

  const response =
    await fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" +
        encodeURIComponent(
          env.FIREBASE_API_KEY
        ),
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          idToken,
        }),
      }
    );

  if (!response.ok) {
    throw new Response(
      "Unauthorized",
      { status: 401 }
    );
  }

  const data =
    await response.json();

  const firebaseUser =
    data.users?.[0];

  if (
    !firebaseUser?.localId ||
    firebaseUser.disabled
  ) {
    throw new Response(
      "Unauthorized",
      { status: 401 }
    );
  }

  let claims = {};
  try {
    claims =
      firebaseUser.customAttributes
        ? JSON.parse(
            firebaseUser.customAttributes
          )
        : {};
  } catch {
    claims = {};
  }

  return {
    uid: firebaseUser.localId,
    email:
      firebaseUser.email || "",
    idToken,
    claims,
  };
}

/* ------------------------------
   FIRESTORE
-------------------------------- */

function firestoreBase(env) {
  return (
    "https://firestore.googleapis.com/v1/" +
    "projects/" +
    env.FIREBASE_PROJECT_ID +
    "/databases/(default)/documents"
  );
}

async function firestoreFetch(
  url,
  idToken,
  options = {}
) {
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization:
        "Bearer " + idToken,
    },
  });
}

async function profileFromDocument(
  document,
  collectionId
) {
  if (!document) {
    return null;
  }

  const fields =
    document.fields || {};

  if (
    fields.ativo
      ?.booleanValue === false
  ) {
    return null;
  }

  if (
    fields.permissoes
      ?.mapValue
      ?.fields
      ?.acessoApp
      ?.booleanValue === false
  ) {
    return null;
  }

  const stringValue =
    name =>
      fields[name]
        ?.stringValue || "";

  return {
    id:
      document.name
        .split("/")
        .pop(),
    collection:
      collectionId,
    role: [
      stringValue("cargo"),
      stringValue("funcao"),
      stringValue("perfil"),
      stringValue("tipo"),
      stringValue("tipoAcesso"),
      stringValue("role"),
    ]
      .filter(Boolean)
      .join(" "),
  };
}

async function findProfileInCollection(
  env,
  user,
  collectionId
) {
  // Mesma ordem usada pelo dashboard:
  // 1. documento cujo ID é o Firebase UID;
  // 2. fallback por e-mail.
  try {
    const uidResponse =
      await firestoreFetch(
        firestoreBase(env) +
          "/" +
          encodeURIComponent(
            collectionId
          ) +
          "/" +
          encodeURIComponent(
            user.uid
          ),
        user.idToken
      );

    if (uidResponse.ok) {
      const uidDocument =
        await uidResponse.json();

      const uidProfile =
        await profileFromDocument(
          uidDocument,
          collectionId
        );

      if (uidProfile) {
        return uidProfile;
      }
    }
  } catch {}

  if (!user.email) {
    return null;
  }

  const response =
    await firestoreFetch(
      firestoreBase(env) +
        ":runQuery",
      user.idToken,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          structuredQuery: {
            from: [
              {
                collectionId,
              },
            ],
            where: {
              fieldFilter: {
                field: {
                  fieldPath:
                    "email",
                },
                op: "EQUAL",
                value: {
                  stringValue:
                    user.email,
                },
              },
            },
            limit: 1,
          },
        }),
      }
    );

  if (!response.ok) {
    return null;
  }

  const results =
    await response.json();

  const document =
    results.find(
      item => item.document
    )?.document;

  return profileFromDocument(
    document,
    collectionId
  );
}

function normalizeAccessText(
  value
) {
  return String(value || "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase();
}

function isManagementProfile(
  profile,
  user
) {
  if (!profile) {
    return false;
  }

  const email =
    normalizeAccessText(
      user?.email
    );

  if (
    email ===
    "eric.lima@advancetintas.com.br"
  ) {
    return true;
  }

  if (
    [
      "administradores",
      "gestores",
    ].includes(
      profile.collection
    )
  ) {
    return true;
  }

  const claims =
    user?.claims || {};

  if (
    claims.admin === true ||
    claims.gestor === true ||
    claims.manager === true
  ) {
    return true;
  }

  const role =
    normalizeAccessText(
      [
        profile.role,
        claims.role,
        claims.perfil,
        claims.cargo,
        claims.tipoAcesso,
      ]
        .filter(Boolean)
        .join(" ")
    );

  return [
    "admin",
    "administrador",
    "diretor",
    "diretora",
    "gerente",
    "gestor",
    "gestora",
    "coordenador",
    "coordenadora",
    "supervisor",
    "supervisora",
  ].some(
    term =>
      role.includes(term)
  );
}

async function getAdvanceProfile(
  env,
  user
) {
  if (!user.email) {
    return null;
  }

  for (
    const collectionId
    of [
      "administradores",
      "gestores",
      "assistencia",
      "promotores",
    ]
  ) {
    const profile =
      await findProfileInCollection(
        env,
        user,
        collectionId
      );

    if (profile) {
      return profile;
    }
  }

  if (
    normalizeAccessText(
      user.email
    ) ===
    "eric.lima@advancetintas.com.br"
  ) {
    return {
      id: user.uid,
      collection:
        "gestores",
      role: "Gestão",
    };
  }

  return null;
}

async function requireManagement(
  env,
  user
) {
  const profile =
    await getAdvanceProfile(
      env,
      user
    );

  if (
    !profile ||
    !isManagementProfile(
      profile,
      user
    )
  ) {
    throw new Response(
      "Esta operação é restrita aos perfis de gestão.",
      { status: 403 }
    );
  }

  return profile;
}

async function getActivity(
  env,
  user,
  activityId
) {
  const response =
    await firestoreFetch(
      firestoreBase(env) +
        "/atividades/" +
        encodeURIComponent(
          activityId
        ),
      user.idToken
    );

  if (
    response.status === 404
  ) {
    return null;
  }

  if (!response.ok) {
    throw new Response(
      "Não foi possível consultar a atividade.",
      {
        status:
          response.status === 403
            ? 403
            : 500,
      }
    );
  }

  return response.json();
}

async function authorizeActivity(
  env,
  user,
  activityId,
  requireInProgress = false
) {
  const profile =
    await getAdvanceProfile(
      env,
      user
    );

  if (!profile) {
    throw new Response(
      "Perfil do Advance não encontrado.",
      { status: 403 }
    );
  }

  const managementAccess =
    isManagementProfile(
      profile,
      user
    );

  const activity =
    await getActivity(
      env,
      user,
      activityId
    );

  if (!activity) {
    throw new Response(
      "Atividade não encontrada.",
      { status: 404 }
    );
  }

  const fields =
    activity.fields || {};

  const ptvId =
    fields.ptvId
      ?.stringValue || "";

  const status =
    fields.status
      ?.stringValue || "";

  if (
    !managementAccess &&
    ptvId !== profile.id
  ) {
    throw new Response(
      "Esta atividade não pertence ao usuário conectado.",
      { status: 403 }
    );
  }

  if (
    !managementAccess &&
    requireInProgress &&
    status !==
      "Em andamento"
  ) {
    throw new Response(
      "Esta operação só é permitida em uma visita em andamento.",
      { status: 409 }
    );
  }

  return {
    activity,
    profile,
  };
}

/* ------------------------------
   R2 STATS
-------------------------------- */

function xmlValue(
  xml,
  tag
) {
  const match =
    xml.match(
      new RegExp(
        "<" +
        tag +
        ">([\\s\\S]*?)<\\/" +
        tag +
        ">"
      )
    );

  if (!match) {
    return "";
  }

  return match[1]
    .replace(
      /&amp;/g,
      "&"
    )
    .replace(
      /&lt;/g,
      "<"
    )
    .replace(
      /&gt;/g,
      ">"
    )
    .replace(
      /&quot;/g,
      "\""
    )
    .replace(
      /&#39;/g,
      "'"
    );
}

async function calculateStorageStats(
  env
) {
  let continuationToken = "";
  let totalBytes = 0;
  let objectCount = 0;
  let imageCount = 0;
  let thumbnailCount = 0;
  let pages = 0;

  do {
    const queryParams = [
      [
        "list-type",
        "2",
      ],
      [
        "max-keys",
        "1000",
      ],
      [
        "prefix",
        "v1/activities/",
      ],
    ];

    if (
      continuationToken
    ) {
      queryParams.push([
        "continuation-token",
        continuationToken,
      ]);
    }

    const listUrl =
      await createPresignedUrl({
        env,
        method: "GET",
        key: "",
        expires: 60,
        queryParams,
      });

    const response =
      await fetch(listUrl);

    if (!response.ok) {
      throw new Error(
        "Falha ao consultar o armazenamento: HTTP " +
        response.status
      );
    }

    const xml =
      await response.text();

    const contents = [
      ...xml.matchAll(
        /<Contents>([\s\S]*?)<\/Contents>/g
      ),
    ];

    for (
      const content
      of contents
    ) {
      const block =
        content[1];

      const key =
        xmlValue(
          block,
          "Key"
        );

      const size =
        Number(
          xmlValue(
            block,
            "Size"
          )
        ) || 0;

      totalBytes += size;
      objectCount += 1;

      if (
        key.endsWith(
          "/original"
        )
      ) {
        imageCount += 1;
      }

      if (
        key.endsWith(
          "/thumbnail.jpg"
        )
      ) {
        thumbnailCount += 1;
      }
    }

    const truncated =
      xmlValue(
        xml,
        "IsTruncated"
      ) === "true";

    continuationToken =
      truncated
        ? xmlValue(
            xml,
            "NextContinuationToken"
          )
        : "";

    pages += 1;

    if (
      pages > 10000
    ) {
      throw new Error(
        "A listagem do bucket excedeu o limite de segurança."
      );
    }
  } while (
    continuationToken
  );

  return {
    totalBytes,
    objectCount,
    imageCount,
    thumbnailCount,
    pages,
    updatedAt:
      new Date()
        .toISOString(),
  };
}

async function storageStatsCached(
  request,
  env
) {
  const cache =
    caches.default;

  const cacheUrl =
    new URL(
      request.url
    );

  cacheUrl.pathname =
    "/__cache/media-storage-stats";

  cacheUrl.search = "";

  const cacheKey =
    new Request(
      cacheUrl.toString(),
      { method: "GET" }
    );

  const cachedResponse =
    await cache.match(
      cacheKey
    );

  if (
    cachedResponse
  ) {
    const data =
      await cachedResponse.json();

    return {
      ...data,
      cached: true,
    };
  }

  const data =
    await calculateStorageStats(
      env
    );

  const cacheResponse =
    new Response(
      JSON.stringify(data),
      {
        headers: {
          "Content-Type":
            "application/json",
          "Cache-Control":
            "public, max-age=900",
        },
      }
    );

  await cache.put(
    cacheKey,
    cacheResponse
  );

  return {
    ...data,
    cached: false,
  };
}

/* ------------------------------
   VALIDATORS
-------------------------------- */

function validId(value) {
  return (
    typeof value ===
      "string" &&
    /^[A-Za-z0-9._-]{1,180}$/.test(
      value
    )
  );
}

function validContentType(
  type
) {
  return (
    typeof type ===
      "string" &&
    /^image\/[A-Za-z0-9.+-]+$/i.test(
      type
    )
  );
}

/* ------------------------------
   WORKER
-------------------------------- */

export default {
  async fetch(
    request,
    env
  ) {
    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,
          headers:
            corsHeaders,
        }
      );
    }

    const url =
      new URL(
        request.url
      );

    if (
      url.pathname ===
      "/health"
    ) {
      return json({
        ok: true,
        service:
          "advance-media-api",
      });
    }

    try {
      if (
        url.pathname ===
          "/v1/media/upload-url" &&
        request.method ===
          "POST"
      ) {
        const user =
          await authenticate(
            request,
            env
          );

        const body =
          await request.json();

        const {
          activityId,
          mediaId,
          contentType,
          size,
        } = body;

        if (
          !validId(
            activityId
          )
        ) {
          return json(
            {
              error:
                "activityId inválido.",
            },
            400
          );
        }

        if (
          !validId(
            mediaId
          )
        ) {
          return json(
            {
              error:
                "mediaId inválido.",
            },
            400
          );
        }

        if (
          !validContentType(
            contentType
          )
        ) {
          return json(
            {
              error:
                "Somente imagens são permitidas.",
            },
            415
          );
        }

        const bytes =
          Number(size);

        if (
          !Number.isFinite(
            bytes
          ) ||
          bytes <= 0
        ) {
          return json(
            {
              error:
                "Tamanho inválido.",
            },
            400
          );
        }

        if (
          bytes >
          500 * 1024
        ) {
          return json(
            {
              error:
                "A imagem processada ultrapassou 500 KB.",
            },
            413
          );
        }

        await authorizeActivity(
          env,
          user,
          activityId,
          true
        );

        const baseKey =
          "v1/activities/" +
          activityId +
          "/media/" +
          mediaId;

        const originalKey =
          baseKey +
          "/original";

        const thumbnailKey =
          baseKey +
          "/thumbnail.jpg";

        const originalUploadUrl =
          await createPresignedUrl({
            env,
            method: "PUT",
            key: originalKey,
            contentType,
            expires: 300,
          });

        const thumbnailUploadUrl =
          await createPresignedUrl({
            env,
            method: "PUT",
            key: thumbnailKey,
            contentType:
              "image/jpeg",
            expires: 300,
          });

        return json({
          mediaId,
          original: {
            key:
              originalKey,
            uploadUrl:
              originalUploadUrl,
          },
          thumbnail: {
            key:
              thumbnailKey,
            uploadUrl:
              thumbnailUploadUrl,
          },
          expiresIn: 300,
          maxBytes:
            500 * 1024,
        });
      }

      if (
        url.pathname ===
          "/v1/media/read-url" &&
        request.method ===
          "POST"
      ) {
        const user =
          await authenticate(
            request,
            env
          );

        const body =
          await request.json();

        const {
          activityId,
          mediaId,
          variant =
            "original",
        } = body;

        if (
          !validId(
            activityId
          ) ||
          !validId(
            mediaId
          )
        ) {
          return json(
            {
              error:
                "Identificadores inválidos.",
            },
            400
          );
        }

        if (
          ![
            "original",
            "thumbnail",
          ].includes(
            variant
          )
        ) {
          return json(
            {
              error:
                "Variant inválido.",
            },
            400
          );
        }

        await authorizeActivity(
          env,
          user,
          activityId
        );

        const baseKey =
          "v1/activities/" +
          activityId +
          "/media/" +
          mediaId;

        const objectKey =
          variant ===
            "thumbnail"
            ? baseKey +
              "/thumbnail.jpg"
            : baseKey +
              "/original";

        const readUrl =
          await createPresignedUrl({
            env,
            method: "GET",
            key:
              objectKey,
            expires: 300,
          });

        return json({
          key:
            objectKey,
          url:
            readUrl,
          expiresIn: 300,
        });
      }

      if (
        url.pathname ===
          "/v1/media/read-urls" &&
        request.method ===
          "POST"
      ) {
        const user =
          await authenticate(
            request,
            env
          );

        await requireManagement(
          env,
          user
        );

        const body =
          await request.json();

        const items =
          Array.isArray(
            body?.items
          )
            ? body.items
            : [];

        if (
          !items.length ||
          items.length > 30
        ) {
          return json(
            {
              error:
                "Envie de 1 a 30 mídias por lote.",
            },
            400
          );
        }

        const normalized =
          items.map(
            item => ({
              activityId:
                item?.activityId,
              mediaId:
                item?.mediaId,
              variant:
                item?.variant ||
                "thumbnail",
            })
          );

        if (
          normalized.some(
            item =>
              !validId(
                item.activityId
              ) ||
              !validId(
                item.mediaId
              ) ||
              ![
                "original",
                "thumbnail",
              ].includes(
                item.variant
              )
          )
        ) {
          return json(
            {
              error:
                "Há identificadores ou variantes inválidos no lote.",
            },
            400
          );
        }

        const signedItems =
          await Promise.all(
            normalized.map(
              async item => {
                const baseKey =
                  "v1/activities/" +
                  item.activityId +
                  "/media/" +
                  item.mediaId;

                const key =
                  item.variant ===
                    "thumbnail"
                    ? baseKey +
                      "/thumbnail.jpg"
                    : baseKey +
                      "/original";

                return {
                  mediaId:
                    item.mediaId,
                  activityId:
                    item.activityId,
                  variant:
                    item.variant,
                  url:
                    await createPresignedUrl({
                      env,
                      method:
                        "GET",
                      key,
                      expires:
                        300,
                    }),
                };
              }
            )
          );

        return json({
          items:
            signedItems,
          expiresIn:
            300,
        });
      }

      if (
        url.pathname ===
          "/v1/media/storage-stats" &&
        request.method ===
          "POST"
      ) {
        const user =
          await authenticate(
            request,
            env
          );

        await requireManagement(
          env,
          user
        );

        const stats =
          await storageStatsCached(
            request,
            env
          );

        return json(
          stats
        );
      }

      if (
        url.pathname ===
          "/v1/media/delete" &&
        request.method ===
          "POST"
      ) {
        const user =
          await authenticate(
            request,
            env
          );

        const body =
          await request.json();

        const {
          activityId,
          mediaId,
        } = body;

        if (
          !validId(
            activityId
          ) ||
          !validId(
            mediaId
          )
        ) {
          return json(
            {
              error:
                "Identificadores inválidos.",
            },
            400
          );
        }

        await authorizeActivity(
          env,
          user,
          activityId,
          true
        );

        const baseKey =
          "v1/activities/" +
          activityId +
          "/media/" +
          mediaId;

        const keys = [
          baseKey +
            "/original",
          baseKey +
            "/thumbnail.jpg",
        ];

        for (
          const key
          of keys
        ) {
          const deleteUrl =
            await createPresignedUrl({
              env,
              method:
                "DELETE",
              key,
              expires:
                60,
            });

          const response =
            await fetch(
              deleteUrl,
              {
                method:
                  "DELETE",
              }
            );

          if (
            !response.ok &&
            response.status !==
              404
          ) {
            throw new Error(
              "Falha ao excluir " +
              key +
              ": HTTP " +
              response.status
            );
          }
        }

        return json({
          ok: true,
          mediaId,
        });
      }

      return json(
        {
          error:
            "Endpoint não encontrado.",
        },
        404
      );
    } catch (error) {
      if (
        error instanceof
        Response
      ) {
        const message =
          await error.text();

        return json(
          {
            error:
              message ||
              "Operação não autorizada.",
          },
          error.status
        );
      }

      console.error(
        error
      );

      return json(
        {
          error:
            "Erro interno.",
        },
        500
      );
    }
  },
};

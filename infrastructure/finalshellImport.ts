import {
  isFinalShellConfigJson,
  isFinalShellConnectJson,
  loadFinalShellSecretKeyMap,
} from "@/domain/vaultImport/finalshell";

type FinalShellElectronApi = {
  decodePassword?: (encrypted: string) => Promise<string | null>;
  decodePrivateKey?: (keyData: string) => Promise<string | null>;
};

function getFinalShellApi(): FinalShellElectronApi | undefined {
  return window.netcatty?.finalshell;
}

export async function prepareFinalShellImportText(
  text: string,
  options?: { secretKeyMap?: Record<string, string> },
): Promise<string> {
  if (isFinalShellConfigJson(text)) {
    return text;
  }
  if (!isFinalShellConnectJson(text)) {
    return text;
  }

  const api = getFinalShellApi();
  if (!api) {
    return text;
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return text;
  }

  const secretKeyMap = options?.secretKeyMap ?? {};
  const encryptedPassword = typeof data.password === "string" ? data.password.trim() : "";
  if (encryptedPassword && api.decodePassword) {
    const plain = await api.decodePassword(encryptedPassword);
    if (plain) {
      data.password_plain = plain;
    }
  }

  const secretKeyId = typeof data.secret_key_id === "string" ? data.secret_key_id.trim() : "";
  const keyData = secretKeyId ? secretKeyMap[secretKeyId] : undefined;
  if (keyData && api.decodePrivateKey) {
    const privateKey = await api.decodePrivateKey(keyData);
    if (privateKey) {
      data.private_key_plain = privateKey;
    }
  }

  return JSON.stringify(data);
}

export async function prepareFinalShellImportFiles(
  files: Array<{ text: string; fileName?: string }>,
): Promise<Array<{ text: string; fileName?: string }>> {
  let secretKeyMap: Record<string, string> = {};
  for (const file of files) {
    if (isFinalShellConfigJson(file.text)) {
      secretKeyMap = { ...secretKeyMap, ...loadFinalShellSecretKeyMap(file.text) };
    }
  }

  return Promise.all(
    files.map(async (file) => ({
      fileName: file.fileName,
      text: await prepareFinalShellImportText(file.text, { secretKeyMap }),
    })),
  );
}

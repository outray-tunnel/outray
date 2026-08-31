import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  ownerAc,
} from "better-auth/plugins/organization/access";

const statement = {
  ...defaultStatements,
  tunnel: ["create", "update", "delete"],
  subdomain: ["create", "delete"],
  authToken: ["create", "delete"],
  secret: ["read", "write", "delete"],
  secretProject: ["create", "update", "delete"],
  secretToken: ["create", "delete"],
  secretTrash: ["read", "restore", "purge"],
  domain: ["create", "delete", "verify"],
  billing: ["manage"],
} as const;

export const ac = createAccessControl(statement);

export const member = ac.newRole({
  tunnel: ["create", "update", "delete"],
  subdomain: ["create", "delete"],
  secret: ["read", "write", "delete"],
  secretTrash: ["read"],
  domain: ["create", "delete", "verify"],
});

export const admin = ac.newRole({
  ...adminAc.statements,
  tunnel: ["create", "update", "delete"],
  subdomain: ["create", "delete"],
  authToken: ["create", "delete"],
  secret: ["read", "write", "delete"],
  secretProject: ["create", "update", "delete"],
  secretToken: ["create", "delete"],
  secretTrash: ["read", "restore", "purge"],
  domain: ["create", "delete", "verify"],
  billing: ["manage"],
});

export const owner = ac.newRole({
  ...ownerAc.statements,
  tunnel: ["create", "update", "delete"],
  subdomain: ["create", "delete"],
  authToken: ["create", "delete"],
  secret: ["read", "write", "delete"],
  secretProject: ["create", "update", "delete"],
  secretToken: ["create", "delete"],
  secretTrash: ["read", "restore", "purge"],
  domain: ["create", "delete", "verify"],
  billing: ["manage"],
});

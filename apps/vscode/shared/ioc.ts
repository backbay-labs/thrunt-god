export type IOCType =
  | 'ipv4'
  | 'ipv6'
  | 'domain'
  | 'md5'
  | 'sha1'
  | 'sha256'
  | 'email'
  | 'url'
  | 'unknown';

export type IOCArtifactType = 'query' | 'receipt';

export interface IOCMatchResult {
  artifactId: string;
  artifactType: IOCArtifactType;
  templateId: string | null;
  matchContext: string;
  lineNumber: number | null;
  matchCount: number;
}

export interface IOCEntry {
  id: string;
  value: string;
  normalizedValue: string;
  type: IOCType;
  addedAt: string;
  matchResults: IOCMatchResult[];
}

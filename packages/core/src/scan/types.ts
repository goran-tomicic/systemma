// What the scan needs from a file. A browser File satisfies it once the caller supplies a repo-relative
// path (File.webkitRelativePath without its first segment); a Node reader can build one from fs.
export interface FileLike {
  path: string;
  size: number;
  text(): Promise<string>;
}

export interface Candidate {
  file: FileLike;
  path: string;
  kind: 'css' | 'json';
  // custom properties for CSS, tokens for JSON
  count: number;
  // whether the file looks enough like a token definition to be pre-selected
  checked: boolean;
}

export interface ScanCandidates {
  candidates: Candidate[];
  // canonical ids of every custom property declared anywhere in a style file
  declared: Set<string>;
  usable: FileLike[];
  total: number;
}

export interface ScanSummary {
  defFiles: number;
  defValues: number;
  scanned: number;
  filesWithUsage: number;
  usages: number;
}

export type Progress = (done: number, total: number) => void;

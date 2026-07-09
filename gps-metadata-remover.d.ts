declare module '@xoi/gps-metadata-remover' {
  export function removeLocation(
    path: string,
    read: (size: number, offset: number) => Promise<ArrayBuffer>,
    write: (value: string, offset: number, encoding: string) => Promise<void>,
    options?: { skipXMPRemoval?: boolean }
  ): Promise<boolean>;
}

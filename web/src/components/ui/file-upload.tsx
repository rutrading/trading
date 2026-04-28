"use client";

import {
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileText,
  FileVideo,
  Image as ImageIcon,
  UploadCloud,
  X,
} from "lucide-react";
import type * as React from "react";
import { useEffect, useState } from "react";
import {
  type Accept,
  type DropzoneOptions,
  type FileRejection,
  useDropzone,
} from "react-dropzone";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / k ** i;
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};

export const isImage = (file: File): boolean => file.type.startsWith("image/");

export const fileTypeIcon = (
  file: File,
): React.ComponentType<{ className?: string }> => {
  const t = file.type;
  if (t.startsWith("image/")) return ImageIcon;
  if (t.startsWith("video/")) return FileVideo;
  if (t.startsWith("audio/")) return FileAudio;
  if (
    t === "application/zip" ||
    t === "application/x-tar" ||
    t === "application/gzip" ||
    t === "application/x-7z-compressed" ||
    t === "application/x-rar-compressed"
  )
    return FileArchive;
  if (
    t.startsWith("text/") ||
    t === "application/json" ||
    t === "application/pdf"
  )
    return FileText;
  return FileIcon;
};

const sameFile = (a: File, b: File): boolean =>
  a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

type GroupedRejection = { message: string; names: string[] };

const groupRejections = (rejections: FileRejection[]): GroupedRejection[] => {
  const map = new Map<string, string[]>();
  for (const r of rejections) {
    const message = r.errors.map((e) => e.message).join(", ");
    const list = map.get(message) ?? [];
    list.push(r.file.name);
    map.set(message, list);
  }
  return Array.from(map.entries()).map(([message, names]) => ({
    message,
    names,
  }));
};

export const usePreviewUrl = (file: File | undefined): string | undefined => {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!file || !isImage(file)) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
};

type UseFileUploadOptions = Omit<
  DropzoneOptions,
  "onDrop" | "onDropAccepted" | "onDropRejected"
> & {
  value?: File[];
  defaultValue?: File[];
  onValueChange?: (files: File[]) => void;
  onFilesAdded?: (added: File[]) => void;
  onFilesRejected?: (rejections: FileRejection[]) => void;
};

export type UseFileUploadReturn = {
  files: File[];
  add: (files: File[]) => void;
  remove: (file: File) => void;
  clear: () => void;
  rejections: FileRejection[];
  getRootProps: ReturnType<typeof useDropzone>["getRootProps"];
  getInputProps: ReturnType<typeof useDropzone>["getInputProps"];
  isDragActive: boolean;
  isDragReject: boolean;
  open: () => void;
};

export const useFileUpload = (
  opts: UseFileUploadOptions = {},
): UseFileUploadReturn => {
  const {
    value,
    defaultValue,
    onValueChange,
    onFilesAdded,
    onFilesRejected,
    multiple,
    maxFiles,
    ...dropzoneOpts
  } = opts;

  const isControlled = value !== undefined;
  const [internalFiles, setInternalFiles] = useState<File[]>(
    defaultValue ?? [],
  );
  const files = isControlled ? value : internalFiles;
  const [rejections, setRejections] = useState<FileRejection[]>([]);

  const setFiles = (next: File[]) => {
    if (!isControlled) setInternalFiles(next);
    onValueChange?.(next);
  };

  const add = (incoming: File[]) => {
    if (incoming.length === 0) return;
    const deduped = incoming.filter(
      (f) => !files.some((existing) => sameFile(existing, f)),
    );
    if (deduped.length === 0) return;
    let next: File[];
    if (multiple) {
      next = [...files, ...deduped];
      if (typeof maxFiles === "number" && next.length > maxFiles) {
        next = next.slice(0, maxFiles);
      }
    } else {
      next = [deduped[deduped.length - 1] as File];
    }
    setFiles(next);
    onFilesAdded?.(deduped);
  };

  const remove = (target: File) => {
    setFiles(files.filter((f) => !sameFile(f, target)));
  };

  const clear = () => {
    setFiles([]);
    setRejections([]);
  };

  const dropzone = useDropzone({
    ...dropzoneOpts,
    multiple,
    maxFiles,
    onDropAccepted: (accepted: File[]) => add(accepted),
    onDropRejected: (next: FileRejection[]) => {
      setRejections(next);
      onFilesRejected?.(next);
    },
  });

  return {
    files,
    add,
    remove,
    clear,
    rejections,
    getRootProps: dropzone.getRootProps,
    getInputProps: dropzone.getInputProps,
    isDragActive: dropzone.isDragActive,
    isDragReject: dropzone.isDragReject,
    open: dropzone.open,
  };
};

export type FileUploadProps = {
  value?: File[];
  defaultValue?: File[];
  onValueChange?: (files: File[]) => void;
  onFilesAdded?: (added: File[]) => void;
  onFilesRejected?: (rejections: FileRejection[]) => void;
  multiple?: boolean;
  accept?: Accept;
  maxSize?: number;
  maxFiles?: number;
  disabled?: boolean;
  layout?: "list" | "grid";
  preview?: boolean;
  /** Hide the dropzone after files exist (for single-file replace pattern). */
  hideDropzoneWhenFilled?: boolean;
  title?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  dropzoneClassName?: string;
  listClassName?: string;
  id?: string;
  name?: string;
};

const describeAccept = (accept?: Accept, maxSize?: number): string => {
  const parts: string[] = [];
  if (accept) {
    const exts = Object.values(accept).flat();
    if (exts.length > 0) {
      parts.push(exts.join(", ").replaceAll(".", "").toUpperCase());
    } else {
      parts.push(
        Object.keys(accept)
          .map((k) => k.replace("/*", "").toUpperCase())
          .join(", "),
      );
    }
  }
  if (typeof maxSize === "number") {
    parts.push(`up to ${formatBytes(maxSize)}`);
  }
  return parts.join(", ");
};

export const FileUpload = (props: FileUploadProps) => {
  const layout = props.layout ?? "list";
  const acceptDesc = describeAccept(props.accept, props.maxSize);
  const description =
    props.description ??
    (acceptDesc ? acceptDesc : props.multiple ? "Any file type" : "One file");

  const {
    files,
    remove,
    rejections,
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject,
    open,
  } = useFileUpload({
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: props.onValueChange,
    onFilesAdded: props.onFilesAdded,
    onFilesRejected: props.onFilesRejected,
    multiple: props.multiple,
    accept: props.accept,
    maxSize: props.maxSize,
    maxFiles: props.maxFiles,
    disabled: props.disabled,
  });

  const showDropzone = !(props.hideDropzoneWhenFilled && files.length > 0);
  const hasFiles = files.length > 0;
  const showPreview = props.preview ?? true;

  return (
    <div className={cn("flex flex-col gap-3", props.className)}>
      {showDropzone ? (
        <div
          {...getRootProps()}
          className={cn(
            "relative cursor-pointer rounded-xl border border-border border-dashed bg-card transition-[background-color,border-color,box-shadow]",
            "hover:bg-[color-mix(in_srgb,var(--foreground)_3%,var(--card))]",
            isDragActive &&
              "border-foreground/50 bg-[color-mix(in_srgb,var(--foreground)_5%,var(--card))]",
            isDragReject &&
              "border-destructive bg-[color-mix(in_srgb,var(--destructive)_6%,var(--card))]",
            props.disabled && "pointer-events-none opacity-64",
            props.dropzoneClassName,
          )}
          data-slot="file-upload-dropzone"
          data-drag-active={isDragActive || undefined}
          data-drag-reject={isDragReject || undefined}
        >
          <input
            {...getInputProps({ id: props.id, name: props.name })}
          />
          <Empty className="md:py-10">
            <EmptyMedia>
              <span
                className={cn(
                  "flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors",
                  isDragActive && "bg-foreground/10 text-foreground",
                  isDragReject && "bg-destructive/10 text-destructive",
                )}
              >
                <UploadCloud className="size-6" aria-hidden="true" />
              </span>
            </EmptyMedia>
            <EmptyTitle>
              {props.title ??
                (isDragReject
                  ? "File type not allowed"
                  : isDragActive
                    ? "Drop to upload"
                    : props.multiple
                      ? "Drop files or click to upload"
                      : "Drop a file or click to upload")}
            </EmptyTitle>
            {description ? (
              <EmptyDescription>{description}</EmptyDescription>
            ) : null}
            <EmptyActions>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={props.disabled}
              >
                Browse files
              </Button>
            </EmptyActions>
          </Empty>
        </div>
      ) : null}

      {hasFiles && layout === "list" ? (
        <ul
          className={cn("flex flex-col gap-2", props.listClassName)}
          data-slot="file-upload-list"
        >
          {files.map((file) => (
            <FileUploadRow
              key={`${file.name}-${file.size}-${file.lastModified}`}
              file={file}
              preview={showPreview}
              onRemove={() => remove(file)}
            />
          ))}
        </ul>
      ) : null}

      {hasFiles && layout === "grid" ? (
        <ul
          className={cn(
            "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4",
            props.listClassName,
          )}
          data-slot="file-upload-list"
        >
          {files.map((file) => (
            <FileUploadGridCell
              key={`${file.name}-${file.size}-${file.lastModified}`}
              file={file}
              onRemove={() => remove(file)}
            />
          ))}
        </ul>
      ) : null}

      {props.hideDropzoneWhenFilled && !props.multiple && hasFiles ? (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={open}
            disabled={props.disabled}
          >
            Replace
          </Button>
        </div>
      ) : null}

      {rejections.length > 0 ? (
        <ul
          className="flex flex-col gap-1 text-destructive-foreground text-xs"
          data-slot="file-upload-rejections"
        >
          {groupRejections(rejections)
            .slice(0, 3)
            .map((g, i) => (
              <li key={i}>
                {g.names.length > 1 ? (
                  <>
                    <span className="font-medium">{g.message}</span>
                    <span> — {g.names.length} files rejected</span>
                  </>
                ) : (
                  <>
                    <span className="font-medium">{g.names[0]}</span>
                    <span> — {g.message}</span>
                  </>
                )}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
};

const FileUploadRow = (props: {
  file: File;
  preview: boolean;
  onRemove: () => void;
}) => {
  const previewUrl = usePreviewUrl(
    props.preview && isImage(props.file) ? props.file : undefined,
  );
  const Icon = fileTypeIcon(props.file);
  return (
    <li
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-2.5 py-2"
      data-slot="file-upload-item"
    >
      {previewUrl ? (
        <Avatar shape="square" size="md">
          <AvatarImage src={previewUrl} alt={props.file.name} />
          <AvatarFallback tone="neutral">
            <Icon className="size-4" />
          </AvatarFallback>
        </Avatar>
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 truncate font-medium text-sm">
          {props.file.name}
        </span>
        <Badge appearance="soft" variant="default" className="shrink-0">
          {formatBytes(props.file.size)}
        </Badge>
      </div>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Remove ${props.file.name}`}
        onClick={props.onRemove}
      >
        <X />
      </Button>
    </li>
  );
};

const FileUploadGridCell = (props: { file: File; onRemove: () => void }) => {
  const previewUrl = usePreviewUrl(props.file);
  const Icon = fileTypeIcon(props.file);
  return (
    <li
      className="group/cell relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
      data-slot="file-upload-item"
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={props.file.name}
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 px-2 text-muted-foreground">
          <Icon className="size-6" aria-hidden="true" />
          <span className="line-clamp-2 text-center text-[10px]">
            {props.file.name}
          </span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity group-hover/cell:opacity-100" />
      <Button
        type="button"
        size="icon-sm"
        variant="secondary"
        aria-label={`Remove ${props.file.name}`}
        onClick={props.onRemove}
        className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover/cell:opacity-100"
      >
        <X />
      </Button>
      <span className="absolute right-1.5 bottom-1.5 left-1.5 line-clamp-1 text-[10px] text-white opacity-0 transition-opacity group-hover/cell:opacity-100">
        {props.file.name}
      </span>
    </li>
  );
};

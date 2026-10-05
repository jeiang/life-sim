import { emojiUrl, iconUrl, splitEmoji } from "../game/format.ts";

/** A Pack content icon (`twemoji:<stem>`). Decorative unless `label` is given. */
export function PackIcon(props: {
  icon: string | undefined;
  label?: string;
  class?: string;
}) {
  const src = iconUrl(props.icon);
  if (!src) return null;
  return (
    <img
      src={src}
      alt={props.label ?? ""}
      aria-hidden={props.label ? undefined : true}
      class={`inline-block size-[1.25em] align-[-0.2em] ${props.class ?? ""}`}
      draggable={false}
    />
  );
}

/** Text with known emoji swapped for Twemoji images; each image's alt is the emoji itself. */
export function EmojiText(props: { text: string }) {
  const parts = splitEmoji(props.text);
  return (
    <>
      {parts.map((part, i) => {
        const src = i % 2 === 1 ? emojiUrl(part) : undefined;
        return src ? (
          <img
            key={i}
            src={src}
            alt={part}
            class="inline-block size-[1.2em] align-[-0.2em]"
            draggable={false}
          />
        ) : (
          part
        );
      })}
    </>
  );
}

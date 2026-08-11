import Image from "next/image";

export default function PageBackground({
  src,
  alt = "",
  priority = false,
  quality = 70,
  sizes = "100vw",
  objectPosition = "center",
  className = "",
  imageClassName = "",
  fixed = false, // when true, background stays pinned to viewport as page scrolls
}) {
  const positionClass = fixed ? "fixed inset-0" : "absolute inset-0";
  return (
    <div
      className={`${positionClass} ${className}`}
      style={fixed ? { zIndex: 0 } : undefined}
      aria-hidden={alt ? undefined : true}
    >
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        quality={quality}
        sizes={sizes}
        placeholder="blur"
        className={`pointer-events-none select-none object-cover ${imageClassName}`}
        style={{ objectPosition }}
      />
    </div>
  );
}

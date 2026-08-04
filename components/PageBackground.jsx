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
}) {
  return (
    <div className={`absolute inset-0 ${className}`} aria-hidden={alt ? undefined : true}>
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

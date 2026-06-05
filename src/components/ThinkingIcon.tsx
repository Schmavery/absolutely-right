/** Concentric “extra thinking” mark; ring fills follow `--icon-ring-*` in themes.css. */
export function ThinkingIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      overflow="hidden"
      aria-hidden
      className={className}
    >
      <defs>
        <clipPath id="game-title-icon-clip">
          <rect width="32" height="32" />
        </clipPath>
        <filter
          id="game-title-wobble-bg"
          filterUnits="userSpaceOnUse"
          x="-18"
          y="-18"
          width="68"
          height="68"
        >
          <feTurbulence
            x="-4"
            y="-4"
            width="40"
            height="40"
            type="fractalNoise"
            baseFrequency="0.14"
            numOctaves="1"
            seed="3"
            stitchTiles="stitch"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="4"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <filter
          id="game-title-wobble-ghost"
          filterUnits="userSpaceOnUse"
          x="-18"
          y="-18"
          width="68"
          height="68"
        >
          <feTurbulence
            x="-4"
            y="-4"
            width="40"
            height="40"
            type="fractalNoise"
            baseFrequency="0.14"
            numOctaves="2"
            seed="17"
            stitchTiles="stitch"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="4"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <filter
          id="game-title-wobble-mid"
          filterUnits="userSpaceOnUse"
          x="-18"
          y="-18"
          width="68"
          height="68"
        >
          <feTurbulence
            x="-4"
            y="-4"
            width="40"
            height="40"
            type="fractalNoise"
            baseFrequency="0.14"
            numOctaves="2"
            seed="42"
            stitchTiles="stitch"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="4.2"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <filter
          id="game-title-wobble-front"
          filterUnits="userSpaceOnUse"
          x="-18"
          y="-18"
          width="68"
          height="68"
        >
          <feTurbulence
            x="-4"
            y="-4"
            width="40"
            height="40"
            type="fractalNoise"
            baseFrequency="0.14"
            numOctaves="1"
            seed="99"
            stitchTiles="stitch"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="4.2"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
      <g clipPath="url(#game-title-icon-clip)">
        <g filter="url(#game-title-wobble-bg)">
          <path
            fill="var(--icon-ring-bg)"
            fillRule="evenodd"
            d="M 28.6 16 A 12.6 12.6 0 1 1 3.4 16 A 12.6 12.6 0 1 1 28.6 16 Z
               M 18 16 A 2 2 0 1 0 14 16 A 2 2 0 1 0 18 16 Z"
          />
        </g>
        <g filter="url(#game-title-wobble-ghost)">
          <path
            fill="var(--icon-ring-ghost)"
            fillRule="evenodd"
            d="M 28.5 16.5 A 11.5 11.5 0 1 1 5.5 16.5 A 11.5 11.5 0 1 1 28.5 16.5 Z
               M 20.4 16.5 A 3.4 3.4 0 1 0 13.6 16.5 A 3.4 3.4 0 1 0 20.4 16.5 Z"
          />
        </g>
        <g filter="url(#game-title-wobble-mid)">
          <path
            fill="var(--icon-ring-mid)"
            fillRule="evenodd"
            d="M 28 16 A 11 11 0 1 1 6 16 A 11 11 0 1 1 28 16 Z
               M 22.2 16 A 4.8 4.8 0 1 0 11.8 16 A 4.8 4.8 0 1 0 22.2 16 Z"
          />
        </g>
        <g filter="url(#game-title-wobble-front)">
          <path
            fill="var(--icon-ring-front)"
            fillRule="evenodd"
            d="M 26.4 15.6 A 10.6 10.6 0 1 1 5.2 15.6 A 10.6 10.6 0 1 1 26.4 15.6 Z
               M 22 15.6 A 6.2 6.2 0 1 0 9.2 15.6 A 6.2 6.2 0 1 0 22 15.6 Z"
          />
        </g>
      </g>
    </svg>
  );
}

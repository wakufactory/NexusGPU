import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

const getViewportHeight = () => Math.round(window.visualViewport?.height ?? window.innerHeight);

export function useFullscreenViewport() {
  const shellRef = useRef<HTMLElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenHeight, setFullscreenHeight] = useState(getViewportHeight);

  const requestViewportResize = useCallback(() => {
    requestAnimationFrame(() => {
      setFullscreenHeight(getViewportHeight());
    });
  }, []);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === shellRef.current);
      requestViewportResize();
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, [requestViewportResize]);

  useEffect(() => {
    const handleViewportChange = () => requestViewportResize();

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("orientationchange", handleViewportChange);
    window.visualViewport?.addEventListener("resize", handleViewportChange);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("orientationchange", handleViewportChange);
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
    };
  }, [requestViewportResize]);

  const toggleFullscreen = async () => {
    if (isFullscreen) {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        setIsFullscreen(false);
        requestViewportResize();
      }
      return;
    }

    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    try {
      await shell.requestFullscreen();
    } catch (error) {
      console.error("Failed to enter fullscreen mode.", error);
      setIsFullscreen(true);
      requestViewportResize();
    }
  };

  const fullscreenStyle = isFullscreen
    ? ({ "--fullscreen-height": `${fullscreenHeight}px` } as CSSProperties)
    : undefined;

  return {
    shellRef,
    isFullscreen,
    fullscreenStyle,
    toggleFullscreen,
  };
}

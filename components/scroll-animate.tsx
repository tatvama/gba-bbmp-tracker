"use client";

import * as React from "react";
import { motion } from "framer-motion";

interface ScrollAnimateProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
}

export function ScrollAnimate({
  children,
  className,
  delay = 0,
  direction = "up",
}: ScrollAnimateProps) {
  const getOffset = () => {
    switch (direction) {
      case "up":
        return { y: 24 };
      case "down":
        return { y: -24 };
      case "left":
        return { x: 24 };
      case "right":
        return { x: -24 };
      case "none":
      default:
        return {};
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, ...getOffset() }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{
        duration: 0.6,
        delay: delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

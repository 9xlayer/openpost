### Performance

- Accelerated the Image Editor's CPU color-grading fallback by reusing exact channel mappings and preparing color-wheel parameters once per render. Pixel rounding, effect order, alpha, and the GPU path are preserved.

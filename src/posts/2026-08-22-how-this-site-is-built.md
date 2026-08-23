---
title: "How this site is built"
date: 2026-08-22
description: "A placeholder post that doubles as a formatting reference — headings, code, tables, footnotes, quotes and figures all appear here so you can see how each one renders."
tags:
  - "Meta"
  - "Bioinformatics"
---

This post exists so you can see every element the theme styles. Delete the file
at `src/posts/2026-08-22-how-this-site-is-built.md` once the real posts are in.

## Headings and prose

Body text is Source Serif 4 at a measure of about 68 characters, which is where
line length stops fighting the reader. Headings are monospace, because half of
what gets written here happens in a terminal.

### A third-level heading

Links look [like this](https://example.com), and emphasis comes in _italic_ and
**bold**.

## Code

Inline code such as `DESeq2::results()` sits in the body. Blocks get a rail:

```r
library(DESeq2)

dds <- DESeqDataSetFromMatrix(
  countData = counts,
  colData   = coldata,
  design    = ~ condition
)

dds <- DESeq(dds)
res <- results(dds, contrast = c("condition", "HD", "control"))
summary(res)
```

Shell works the same way:

```bash
STAR --runThreadN 8 \
     --genomeDir ref/GRCh38_index \
     --readFilesIn sample_R1.fastq.gz sample_R2.fastq.gz \
     --readFilesCommand zcat \
     --outSAMtype BAM SortedByCoordinate
```

## Tables

| Gene  | log2FC | padj    |
| ----- | -----: | ------: |
| SOCS3 |   2.41 | 3.1e-12 |
| GFAP  |   1.88 | 7.4e-09 |
| CD44  |   1.52 | 2.2e-06 |

## Quotes and asides

> Neuroinflammation turned out to be the dominant signal rather than a side
> effect of one, which changed what the rest of the analysis was for.

<p class="callout">A callout, for caveats and housekeeping that shouldn't carry
the visual weight of a pull quote.</p>

## Footnotes

Claims that need a source can carry one.[^1]

[^1]: Footnotes collect at the bottom and link in both directions.

---

The horizontal rule above uses the same sequence-track motif as the dividers in
the header and footer, and as the progress rail down the left edge of this post.

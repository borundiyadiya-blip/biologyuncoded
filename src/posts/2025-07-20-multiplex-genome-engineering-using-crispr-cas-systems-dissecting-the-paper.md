---
title: "Multiplex Genome Engineering Using CRISPR/Cas Systems: Dissecting the Paper"
date: 2025-07-20
description: "Introduction: This paper discusses the groundbreaking application of CRISPR-Cas9 technology in gene editing within mammalian cells. Specifically, it outlines how the system originally found in Streptococcus pyogenes was reprogrammed to edit human and mouse genomes. It also delves into both the powerful potential and limitations of this transformative genome editing tool. The Biology of CRISPR-Cas9: […]"
tags:
  - "cas9"
  - "crispr"
  - "crRNA"
  - "Diya Borundiya"
  - "HDR"
  - "NHEJ"
  - "tracrRNA"
wordpressUrl: "https://biologyuncoded.wordpress.com/2025/07/20/multiplex-genome-engineering-using-crispr-cas-systems-dissecting-the-paper/"
---

**Introduction:** This paper discusses the groundbreaking application of CRISPR-Cas9 technology in gene editing within mammalian cells. Specifically, it outlines how the system originally found in _Streptococcus pyogenes_ was reprogrammed to edit human and mouse genomes. It also delves into both the powerful potential and limitations of this transformative genome editing tool.

**The Biology of CRISPR-Cas9:** CRISPR (Clustered Regularly Interspaced Short Palindromic Repeats) and its associated protein Cas9 function as an adaptive immune system in bacteria and archaea. When these microorganisms survive viral infections, they integrate fragments of the viral genome, known as spacers, into their own genome between repeated sequences. These spacers serve as genetic memory. Upon reinfection, the bacteria produce two key RNA molecules: a precursor CRISPR RNA (pre-crRNA), which contains the virus-matching spacer, and a trans-activating CRISPR RNA (tracrRNA), which helps guide and process the crRNA. Cas9 binds to the tracrRNA-crRNA duplex (double stranded DNA) and uses it to locate and cleave matching DNA sequences from invading viruses.

**Reconstituting CRISPR in Human Cells:** Cong et al. successfully rebuilt and used this bacterial immune mechanism in human cells by introducing codon-optimized versions of SpCas9, RNase III, pre-crRNA, and tracrRNA. Codon-optimization involves redesigning the DNA sequence of the bacterial genes so they are better suited to the codon usage of human cells, improving protein expression. Nuclear localization signals (NLS) ensured Cas9 was directed to the nucleus. The pre-crRNA contained spacer sequences flanked by direct repeats, and tracrRNA was expressed under the human RNA polymerase III U6 promoter, which is commonly used in molecular biology to drive strong expression of small RNA molecules in mammalian cells. Together, these RNAs formed a guide complex that directed Cas9 to a specific DNA sequence adjacent to an NGG protospacer adjacent motif (PAM), a short sequence critical for Cas9 to cut.

Interestingly, although RNase III was originally thought necessary to process the RNA components, the study revealed that human cells could process pre-crRNA into mature crRNA even in the absence of bacterial RNase III. This suggests endogenous RNases in mammalian cells are capable of substituting the bacterial processing enzymes.

**Chimeric RNA: Structure and Benefits:** To streamline the CRISPR system for practical use, the researchers also developed a chimeric RNA (single-guide RNA (sgRNA) that fuses the crRNA) and tracrRNA into a single molecule using a synthetic loop. This innovation simplifies the CRISPR system, reducing the number of components needed for genome editing. The chimeric RNA retains the ability to direct Cas9 to specific DNA targets while enhancing stability and ease of delivery into cells. It has since become the gold standard in most CRISPR applications due to its simplicity, efficiency, and flexibility.

**Targeting and Editing the Genome:** By designing guide RNAs to target specific genes such as EMX1 and PVALB, the team achieved targeted double-stranded breaks in the human genome. When the DNA is cut, cells repair the break via two main mechanisms:

-   **Non-Homologous End Joining (NHEJ):** Quick but error-prone, often introducing insertions or deletions (indels).
-   **Homology-Directed Repair (HDR):** Precise but less frequent, requiring a repair template.

To improve the accuracy of editing, the researchers engineered a Cas9 variant, SpCas9n (a nickase), that only nicks one DNA strand. This favors the use of HDR, reducing unwanted mutations.

**The Role of Seed Sequence and Mismatches:** Cas9 targeting requires a region known as the “seed sequence” near the PAM site. This short sequence (usually ~8-12 nucleotides) is critical for the initial binding of the Cas9-guide RNA complex to the DNA. The study found that mismatches in or near this seed region abolish Cas9 cleavage activity, emphasizing the system’s high specificity near the PAM.

**Multiplex Genome Editing and Deletion:** One of the most remarkable innovations in the paper was multiplexing, editing multiple genes at once. By using a single pre-crRNA array containing two different spacers, they simultaneously targeted both EMX1 and PVALB. Moreover, by targeting two sites within EMX1 spaced 119 base pairs apart, they induced a precise deletion, demonstrating CRISPR’s ability to remove specific genomic regions. The natural array-based architecture of CRISPR makes it particularly well-suited to multiplex editing, a significant advantage over other genome-editing tools like TALENs or zinc fingers.

**Benefits of CRISPR-Cas9:**

-   **Programmability:** Editing any gene simply requires changing the guide RNA.
-   **Efficiency:** High rates of successful cutting and editing.
-   **Scalability:** Possible to target multiple genes simultaneously.
-   **Versatility:** Can introduce mutations, corrections, insertions, or deletions.
-   **Multiplexing Capability:** Its natural architecture allows simultaneous editing of multiple genomic sites using a single system.
-   **Chimeric RNA Advantage:** Combines crRNA and tracrRNA into one molecule, improving simplicity, stability, and delivery.

**Limitations and Challenges:**

-   **PAM Restriction:** SpCas9 requires an NGG PAM, limiting the number of editable sites.
    -   Side note: Currently, scientists have found ways to change the required PAM sequence by changing the biology of the Cas enzyme.
-   **Off-Target Effects:** Cas9 can sometimes bind and cut at similar but incorrect sequences.
-   **Variable Efficiency:** Editing rates can differ based on chromatin structure and epigenetic factors.
-   **RNA Stability:** Chimeric or synthetic RNAs may degrade or misfold, reducing efficiency.
    -   Side note: Significant improvements have been made to the creation of chimeric RNA, which have become foundational in today’s gene editing world due to their simplicity.

**Conclusion:** Cong et al.’s study laid the foundation for using CRISPR as a general-purpose genome editing tool in mammalian systems. By showing that Cas9 could be guided by RNA to target specific genomic sites, and that it could be multiplexed and modified to reduce error, they sparked a revolution in genetics, biotechnology, and medicine. This work has paved the way for gene therapy, disease modelling, and potentially the eradication of genetic diseases in the future.

The age of programmable biology has begun, and it all started with reengineering a bacterial immune system to edit the human genome.

import { Document, Link, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import { Children, type ReactElement, type ReactNode } from 'react';
import type { Resume } from '@/lib/api/types';
import { publicProfiles } from '@/lib/contact-links';
import type { Lang } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { formatCountry, formatPeriod } from '@/lib/i18n/format';
import { PDF_FAMILIES } from './fonts';
import { pdfTheme } from './theme';

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 44,
    backgroundColor: pdfTheme.bg,
    color: pdfTheme.ink,
    fontFamily: PDF_FAMILIES.text,
    fontSize: 9.5,
  },
  // No `lineHeight` on the page: any page-level lineHeight makes react-pdf drop `render` texts (the page number); the font's own metrics are used.
  name: {
    fontFamily: PDF_FAMILIES.head,
    fontWeight: 700,
    fontSize: 32,
    lineHeight: 1,
    letterSpacing: 0.5,
  },
  label: { marginTop: 4, fontSize: 12.5, fontWeight: 600 },
  place: { marginTop: 2, fontSize: 9, color: pdfTheme.muted },
  contact: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    fontSize: 8.5,
  },
  contactItem: { marginRight: 14, color: pdfTheme.ink, textDecoration: 'none' },
  rule: { marginTop: 10, borderTopWidth: 2, borderTopColor: pdfTheme.accent },
  section: { marginTop: 14 },
  heading: {
    fontFamily: PDF_FAMILIES.head,
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: 0.6,
    paddingBottom: 3,
    marginBottom: 6,
    borderBottomWidth: 0.75,
    borderBottomColor: pdfTheme.accent,
  },
  paragraph: { color: pdfTheme.ink },
  job: { marginBottom: 9 },
  jobHead: { flexDirection: 'row', justifyContent: 'space-between' },
  position: { flexGrow: 1, flexShrink: 1, fontWeight: 600, fontSize: 10.5 },
  period: { marginLeft: 8, fontSize: 9, color: pdfTheme.muted },
  company: { color: pdfTheme.muted, marginBottom: 2 },
  bullet: { flexDirection: 'row', marginTop: 1.5 },
  bulletMark: { width: 10 },
  bulletText: { flex: 1 },
  skill: { marginBottom: 2 },
  strong: { fontWeight: 600 },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 44,
    right: 44,
    fontSize: 8,
    color: pdfTheme.muted,
  },
});

interface CvDocumentProps {
  resume: Resume;
  labels: Dictionary['pdf'];
  /** Singular labels «Certificate» / «Course» (the web's education dictionary). */
  education: Dictionary['education'];
  lang: Lang;
}

function Bullet({ children }: { children: string }) {
  return (
    <View style={styles.bullet}>
      <Text style={styles.bulletMark}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

/** The heading never ends a page alone: it is kept on the same page as the first entry of its section. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const [first, ...rest] = Children.toArray(children);
  return (
    <View style={styles.section}>
      <View wrap={false}>
        <Text style={styles.heading}>{title}</Text>
        {first}
      </View>
      {rest}
    </View>
  );
}

/** One-column A4 CV: header, summary, experience, skills, education and languages, in that order. No icons, images or tables (ATS-friendly). */
export function CvDocument({ resume, labels, education, lang }: CvDocumentProps): ReactElement<DocumentProps> {
  const { profile, contact, experience, skills, languages } = resume;
  const place = [profile.city, formatCountry(profile.countryCode, lang)].filter(Boolean).join(', ');
  const profiles = publicProfiles(contact);
  const hasEducation = resume.education.education.length + resume.education.certificates.length + resume.education.courses.length > 0;
  const nonEmptySkills = skills.filter((group) => group.keywords.length > 0);

  return (
    <Document title={`${profile.name} — CV`} author={profile.name} language={lang} creator="cv-web" producer="cv-web">
      <Page size="A4" style={styles.page}>
        <View>
          <Text style={styles.name}>{profile.name.toLocaleUpperCase(lang)}</Text>
          <Text style={styles.label}>{profile.label}</Text>
          {place ? <Text style={styles.place}>{place}</Text> : null}
          <View style={styles.contact}>
            <Link src={`mailto:${contact.email}`} style={styles.contactItem}>
              {contact.email}
            </Link>
            {profiles.map((item) => (
              <Link key={item.href} src={item.href} style={styles.contactItem}>
                {item.href.replace(/^https?:\/\//, '')}
              </Link>
            ))}
          </View>
          <View style={styles.rule} />
        </View>

        {profile.summary ? (
          <Section title={labels.summary}>
            <Text style={styles.paragraph}>{profile.summary}</Text>
          </Section>
        ) : null}

        {experience.length > 0 ? (
          <Section title={labels.experience}>
            {experience.map((job) => (
              <View key={job.id} style={styles.job} wrap={false}>
                <View style={styles.jobHead}>
                  <Text style={styles.position}>{job.position}</Text>
                  <Text style={styles.period}>{formatPeriod(job.period, lang)}</Text>
                </View>
                <Text style={styles.company}>{[job.company, job.location].filter(Boolean).join(' · ')}</Text>
                {job.summary ? <Text style={styles.paragraph}>{job.summary}</Text> : null}
                {job.phases.map((phase) => (
                  <Bullet key={`${phase.title}-${phase.client ?? ''}`}>{phase.client ? `${phase.title} — ${phase.client}` : phase.title}</Bullet>
                ))}
                {job.highlights.map((highlight) => (
                  <Bullet key={highlight}>{highlight}</Bullet>
                ))}
              </View>
            ))}
          </Section>
        ) : null}

        {nonEmptySkills.length > 0 ? (
          <Section title={labels.skills}>
            {nonEmptySkills.map((group) => (
              <Text key={group.key} style={styles.skill}>
                <Text style={styles.strong}>{group.name}: </Text>
                {group.keywords.join(', ')}
              </Text>
            ))}
          </Section>
        ) : null}

        {hasEducation ? (
          <Section title={labels.education}>
            {resume.education.education.map((item) => (
              <Text key={`${item.institution}-${item.area ?? ''}`} style={styles.skill}>
                <Text style={styles.strong}>{[item.studyType, item.area].filter(Boolean).join(' · ') || item.institution}</Text>
                {item.studyType || item.area ? ` — ${item.institution}` : ''}
              </Text>
            ))}
            {resume.education.certificates.map((item) => (
              <Text key={`${item.name}-${item.issuer ?? ''}`} style={styles.skill}>
                <Text style={styles.strong}>{education.certificate}: </Text>
                {item.issuer ? `${item.name} — ${item.issuer}` : item.name}
              </Text>
            ))}
            {resume.education.courses.map((item) => (
              <Text key={`${item.name}-${item.issuer ?? ''}`} style={styles.skill}>
                <Text style={styles.strong}>{education.course}: </Text>
                {item.issuer ? `${item.name} — ${item.issuer}` : item.name}
              </Text>
            ))}
          </Section>
        ) : null}

        {languages.length > 0 ? (
          <Section title={labels.languages}>
            {languages.map((item) => (
              <Text key={item.language} style={styles.skill}>
                <Text style={styles.strong}>{item.language}</Text>
                {item.fluency ? ` — ${item.fluency}` : ''}
              </Text>
            ))}
          </Section>
        ) : null}

        <Text style={styles.footer} fixed render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
      </Page>
    </Document>
  );
}

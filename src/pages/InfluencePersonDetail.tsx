import { Link, useParams } from 'react-router-dom';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { useInfluencePerson } from '@/hooks/use-influence';

const InfluencePersonDetail = () => {
  const { id } = useParams();
  const { data, isLoading } = useInfluencePerson(id);
  const title = data?.actor?.name || 'Influence person';

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container flex-1 py-8">
        <Link to="/influence" className="font-mono text-xs text-accent hover:underline">← Influence registry</Link>
        <div className="brutalist-border-b pb-2 my-6">
          <h1 className="text-lg font-extrabold tracking-tight">{title}</h1>
          <p className="text-xs font-mono text-muted-foreground mt-1">Company roles, disclosed influence contacts, and reviewed public affiliations.</p>
        </div>
        {isLoading ? (
          <div className="font-mono text-sm text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-6">
            <section className="brutalist-border p-4 bg-secondary">
              <h2 className="font-mono text-xs font-bold mb-2">PUBLICLY REPORTED AFFILIATION</h2>
              <p className="font-mono text-[10px] text-muted-foreground mb-3">
                Reviewed public affiliation is descriptive metadata only. It is not an allegiance signal.
              </p>
              {(data?.publicAffiliations || []).length === 0 ? (
                <div className="font-mono text-xs text-muted-foreground">No reviewed public affiliation claims are visible.</div>
              ) : (
                <div className="space-y-2">
                  {(data?.publicAffiliations || []).map((item) => (
                    <a key={item.id} href={item.source_url} target="_blank" rel="noopener noreferrer" className="block brutalist-border p-2 bg-background hover:bg-card">
                      <span className="font-bold text-sm">{item.affiliation_label}</span>
                      <span className="font-mono text-[10px] text-muted-foreground ml-2">{item.affiliation_type} · reviewed</span>
                    </a>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="font-mono text-xs font-bold text-muted-foreground mb-3">COMPANY ROLES</h2>
              <div className="space-y-2">
                {(data?.companyRoles || []).map((role: any) => (
                  <div key={role.id} className="brutalist-border p-3">
                    <div className="font-bold text-sm">{role.companies?.name || role.company_id}</div>
                    <div className="font-mono text-xs text-muted-foreground">{role.role}</div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="font-mono text-xs font-bold text-muted-foreground mb-3">DISCLOSED CONTACTS</h2>
              <div className="space-y-2">
                {(data?.contacts || []).map((contact) => (
                  <div key={contact.id} className="brutalist-border p-3">
                    <div className="font-bold text-sm">{contact.target_name || contact.target_institution || 'Contact'}</div>
                    <div className="font-mono text-xs text-muted-foreground">{[contact.contact_date, contact.subject, contact.data_source].filter(Boolean).join(' · ')}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
};

export default InfluencePersonDetail;

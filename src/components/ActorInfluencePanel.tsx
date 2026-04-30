import { Link } from 'react-router-dom';
import { Network, ShieldAlert } from 'lucide-react';
import { useInfluencePerson } from '@/hooks/use-influence';

type ActorInfluencePanelProps = {
  politicianId: string;
};

const ActorInfluencePanel = ({ politicianId }: ActorInfluencePanelProps) => {
  const { data, isLoading } = useInfluencePerson(politicianId);
  const contacts = data?.contacts || [];
  const companyRoles = data?.companyRoles || [];
  const affiliations = data?.publicAffiliations || [];

  if (isLoading || (contacts.length === 0 && companyRoles.length === 0 && affiliations.length === 0)) return null;

  return (
    <div className="brutalist-border p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-mono text-xs font-bold flex items-center gap-2">
          <Network className="w-3 h-3" />
          INFLUENCE REGISTRY
        </h3>
        <Link to={`/influence/person/${politicianId}`} className="font-mono text-[10px] text-accent hover:underline">
          OPEN
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="brutalist-border p-2">
          <div className="font-mono text-sm font-bold">{contacts.length}</div>
          <div className="font-mono text-[9px] text-muted-foreground">CONTACTS</div>
        </div>
        <div className="brutalist-border p-2">
          <div className="font-mono text-sm font-bold">{companyRoles.length}</div>
          <div className="font-mono text-[9px] text-muted-foreground">ROLES</div>
        </div>
        <div className="brutalist-border p-2">
          <div className="font-mono text-sm font-bold">{affiliations.length}</div>
          <div className="font-mono text-[9px] text-muted-foreground">REVIEWED AFFIL.</div>
        </div>
      </div>

      {contacts.slice(0, 4).map((contact) => (
        <div key={contact.id} className="font-mono text-[10px] border-b border-border/40 py-1.5 last:border-b-0">
          <div className="font-bold">{contact.target_name || contact.target_institution || 'Disclosed contact'}</div>
          <div className="text-muted-foreground">{[contact.contact_date, contact.subject, contact.data_source].filter(Boolean).join(' · ')}</div>
        </div>
      ))}

      {affiliations.length > 0 && (
        <div className="mt-3 bg-secondary p-2 font-mono text-[10px] text-muted-foreground">
          <div className="flex items-start gap-1.5">
            <ShieldAlert className="w-3 h-3 shrink-0 mt-0.5" />
            <span>Publicly reported affiliation is reviewed, sourced, and not an allegiance signal.</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActorInfluencePanel;

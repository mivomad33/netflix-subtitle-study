import React from 'react';
import { policyLinks } from '../../../shared/firebase/config';

// 개인정보처리방침과 저작권 안내(Firebase Hosting의 공개 페이지, 4.8-4).
export const PolicyLinks: React.FC = () => {
  const links = policyLinks();
  return (
    <p className="nfr-policy-links">
      <a href={links.privacy} target="_blank" rel="noopener noreferrer">
        개인정보처리방침
      </a>
      <span aria-hidden="true"> · </span>
      <a href={links.copyright} target="_blank" rel="noopener noreferrer">
        저작권 안내
      </a>
    </p>
  );
};

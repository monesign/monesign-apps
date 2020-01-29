import React from 'react'
import { useNetwork } from '@monesign/api-react'
import { IdentityBadge } from '@monesign/ui'
import { useIdentity } from '../IdentityManager/IdentityManager'
import LocalLabelPopoverTitle from './LocalLabelPopoverTitle'
import LocalLabelPopoverActionLabel from './LocalLabelPopoverActionLabel'

const LocalIdentityBadge = ({ entity, ...props }) => {
  const network = useNetwork()
  const [label, showLocalIdentityModal] = useIdentity(entity)
  const handleClick = () => showLocalIdentityModal(entity)
  return (
    <IdentityBadge
      label={label || ''}
      entity={entity}
      networkType={network && network.type}
      popoverAction={{
        label: <LocalLabelPopoverActionLabel hasLabel={Boolean(label)} />,
        onClick: handleClick,
      }}
      popoverTitle={
        label ? <LocalLabelPopoverTitle label={label} /> : undefined
      }
      {...props}
    />
  )
}

LocalIdentityBadge.propTypes = {
  ...IdentityBadge.propTypes,
}

export default LocalIdentityBadge

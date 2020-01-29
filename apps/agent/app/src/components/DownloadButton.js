import React from 'react'
import { ButtonIcon } from '@monesign/ui'
import IconDownload from './IconDownload'

const Download = ({ url, filename, ...props }) => (
  <ButtonIcon
    as="a"
    href={url}
    download={filename}
    rel="noopener noreferrer"
    label="Download"
    css={`
      height: 40px;
      padding-top: 4px;
    `}
    {...props}
  >
    <IconDownload />
  </ButtonIcon>
)

export default Download

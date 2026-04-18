import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

type Props = {
  currentEmail?: string;
  newEmail?: string;
  confirmLink?: string;
};

export const ChangeEmailConfirmation = ({
  currentEmail = "current@example.com",
  newEmail = "new@example.com",
  confirmLink = "https://example.com/confirm-email?token=example",
}: Props) => {
  return (
    <Html>
      <Head />
      <Preview>Approve email change on R U Trading</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white px-2 font-sans">
          <Container className="mx-auto my-[40px] max-w-[465px] rounded p-[20px]">
            <Heading className="my-6 text-center font-medium text-2xl text-black">
              Approve email change
            </Heading>

            <Text className="text-center text-[#737373] text-base leading-relaxed">
              Someone requested to change your R U Trading account email from{" "}
              <span className="text-black">{currentEmail}</span> to{" "}
              <span className="text-black">{newEmail}</span>. Click below to
              approve.
            </Text>

            <Section className="my-8 text-center">
              <Button
                href={confirmLink}
                className="rounded-lg bg-black px-6 py-3 font-semibold text-sm text-white"
              >
                Approve Change
              </Button>
            </Section>

            <Hr className="mx-0 mt-[26px] w-full border border-[#eaeaea] border-solid" />
            <Text className="text-[#666666] text-[12px] leading-[24px]">
              If you didn't request this, ignore this email and your address
              will stay the same.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default ChangeEmailConfirmation;
